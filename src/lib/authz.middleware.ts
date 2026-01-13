import type { Context, Next } from 'hono';
import { getEnforcer } from './casbin.js';

export const authzMiddleware = (domainResolver?: (c: Context) => string) => {
    return async (c: Context, next: Next) => {
        const user = c.get('user');
        if (!user) {
            return c.json({ error: 'Unauthorized: No user found in context' }, 401);
        }

        const enforcer = await getEnforcer();
        const sub = user.role; // Use user role as subject
        const dom = domainResolver ? domainResolver(c) : 'admin'; // Default to 'admin' domain
        const obj = c.req.path;
        const act = c.req.method;

        // Check permission (Row Level Security is handled by obj matching)
        const allowed = await enforcer.enforce(sub, dom, obj, act);

        if (!allowed) {
            return c.json({ error: 'Forbidden: You do not have permission to access this resource' }, 403);
        }

        // Column Level Security (Response Filtering)
        await next();

        // Intercept JSON responses
        if (c.res && c.res.headers.get('content-type')?.includes('application/json')) {
            // Retrieve policies to find allowed columns
            // This is a manual lookup to find "Which policy allowed this?" and "What columns are allowed?"
            // We fetch all policies for the subject in the domain
            const policies = await enforcer.getFilteredPolicy(0, sub, dom);

            // Filter policies that match object and action
            // We need to use the same matching logic as the enforcer (keyMatch)
            // Note: This relies on the internal implementation details of how policies are stored
            // p = sub, dom, obj, act, cols

            // Helper to check match
            // We'll import keyMatch from 'casbin' if available, or regex
            // Basic keyMatch (glob) implementation for now assuming simpler paths or exact matches
            // Ideally we should use enforcer's matcher, but that's complex to expose.
            // For now, we iterate and simple match.

            let allowedCols: Set<string> | null = null; // null means ALL

            // Simple KeyMatch shim (or standard wildcard check)
            // In a real scenario, use casbin.util.keyMatch or similar
            const keyMatch = (key: string, pattern: string) => {
                // Simple exact match or * suffix
                if (pattern === '*') return true;
                if (pattern.endsWith('*')) return key.startsWith(pattern.slice(0, -1));
                return key === pattern;
            };

            let matched = false;

            for (const policy of policies) {
                const pObj = policy[2];
                const pAct = policy[3];
                const pCols = policy[4]; // v5

                if (keyMatch(obj, pObj) && (pAct === act || pAct === '*')) {
                    matched = true;
                    // If any rule has *, allow all (set to null)
                    if (!pCols || pCols === '*' || pCols === '') {
                        allowedCols = null;
                        break;
                    }

                    if (allowedCols === null) allowedCols = new Set();
                    pCols.split(',').forEach(col => allowedCols!.add(col.trim()));
                }
            }

            if (allowedCols !== null && matched) {
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
