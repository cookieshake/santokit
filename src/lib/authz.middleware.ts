import type { Context, Next } from 'hono';
import { getEnforcer } from './casbin.js';

export const authzMiddleware = (domainResolver?: (c: Context) => string) => {
    return async (c: Context, next: Next) => {
        const user = c.get('user');
        if (!user) {
            return c.json({ error: 'Unauthorized: No user found in context' }, 401);
        }

        const enforcer = await getEnforcer();
        const userRoles = (user.roles || []) as string[];
        const dom = domainResolver ? domainResolver(c) : 'admin';
        const obj = c.req.path;
        const act = c.req.method;

        // Check if ANY of the user's roles have permission
        let allowed = false;
        for (const role of userRoles) {
            if (await enforcer.enforce(role, dom, obj, act)) {
                allowed = true;
                break;
            }
        }

        if (!allowed) {
            return c.json({ error: 'Forbidden: You do not have permission to access this resource' }, 403);
        }

        // Column Level Security (Response Filtering)
        await next();

        // Intercept JSON responses
        if (c.res && c.res.headers.get('content-type')?.includes('application/json')) {
            // Find all allowed columns across all roles that matched
            let allowedCols: Set<string> | null = null;
            let matchedAny = false;

            for (const role of userRoles) {
                const policies = await enforcer.getFilteredPolicy(0, role, dom);

                const keyMatch = (key: string, pattern: string) => {
                    if (pattern === '*') return true;
                    if (pattern.endsWith('*')) return key.startsWith(pattern.slice(0, -1));
                    return key === pattern;
                };

                for (const policy of policies) {
                    const pObj = policy[2];
                    const pAct = policy[3];
                    const pCols = policy[4];

                    if (keyMatch(obj, pObj) && (pAct === act || pAct === '*')) {
                        matchedAny = true;
                        if (!pCols || pCols === '*' || pCols === '') {
                            allowedCols = null; // ALL allowed if any rule allows all
                            break;
                        }

                        if (allowedCols === null) allowedCols = new Set();
                        pCols.split(',').forEach(col => allowedCols!.add(col.trim()));
                    }
                }
                if (allowedCols === null && matchedAny) break;
            }

            if (allowedCols !== null && matchedAny) {
                const clone = c.res.clone();
                try {
                    const body = await clone.json();
                    const filterData = (item: any) => {
                        if (typeof item !== 'object' || item === null) return item;
                        const newItem: any = {};
                        Object.keys(item).forEach(key => {
                            if (allowedCols!.has(key)) {
                                newItem[key] = item[key];
                            }
                        });
                        return newItem;
                    };

                    let filteredBody;
                    if (Array.isArray(body)) {
                        filteredBody = body.map(filterData);
                    } else {
                        filteredBody = filterData(body);
                    }

                    c.res = new Response(JSON.stringify(filteredBody), {
                        status: c.res.status,
                        headers: c.res.headers,
                    });
                } catch (e) {
                    // Failed to parse JSON, ignore
                }
            }
        }
    };
};
