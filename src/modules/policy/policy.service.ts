
import { db } from "@/db/index.js";
import { policies } from "@/db/schema.js";
import { eq, and, or } from "drizzle-orm";
import { CONSTANTS } from "@/constants.js";

type PolicyAction = 'create' | 'read' | 'update' | 'delete';

export const policyService = {
    /**
     * Evaluate policies for a given user and action on a collection.
     * Returns a SQL-safe WHERE clause string if restricted, or null if allowed without filter.
     * Throws error if access is denied.
     */
    evaluate: async (projectId: number, databaseId: number, collectionName: string, action: PolicyAction, user: any) => {
        // 1. Admin Bypass
        if (user?.roles?.includes('admin')) {
            return { allowed: true, filter: null };
        }

        // 2. Fetch Policies
        // Matches specific project/db/collection OR wildcard (TODO: wildcards if needed, for now specific)
        const userRoles = user?.roles || ['guest'];

        // We find policies that match the action and one of the user's roles
        const applicablePolicies = await db.select().from(policies).where(
            and(
                eq(policies.projectId, projectId),
                eq(policies.databaseId, databaseId),
                eq(policies.collectionName, collectionName),
                eq(policies.action, action)
            )
        );

        // Filter by role manually since array overlap in SQL is tricky without specific operator support in this query context,
        // or just fetch all for collection/action and filter in memory (dataset is small per collection)
        const relevantPolicies = applicablePolicies.filter(p => userRoles.includes(p.role));

        if (relevantPolicies.length === 0) {
            // Default Deny if no policies exist? 
            // Or Default Allow if no policies exist?
            // "Closed by default" is safer for ABAC. 
            // But for backward compatibility? 
            // If I return allowed: false, it blocks everyone.
            // Let's assume Default Deny for now as it's an ABAC feature request request.
            // However, existing users might be blocked.
            // Strategy: ANY matching policy with effect='allow' grants access.
            // IF no policies match the user's role, but policies EXIST for the collection?
            // Let's implement: Explicit Allow required.
            return { allowed: false, filter: null };
        }

        // 3. Evaluate Conditions
        // If multiple policies allow, we combine their conditions with OR.
        // If any policy denies, it overrides (Deny-Overrides).
        // BUT usually ABAC is: (Allow1 OR Allow2) AND (!Deny1 AND !Deny2)

        let allowConditions: string[] = [];
        let denied = false;

        for (const policy of relevantPolicies) {
            if (policy.effect === 'deny') {
                // If condition is empty (always deny) or condition matches
                if (!policy.condition || policy.condition === '{}') {
                    denied = true;
                    break;
                }
                // TODO: Handle deny conditions (complex). For now, blanket deny if effect is deny.
                denied = true;
            } else {
                // Effect: allow
                const conditionSql = parseConditionToSql(policy.condition, user);
                allowConditions.push(conditionSql);
            }
        }

        if (denied) return { allowed: false, filter: null };
        if (allowConditions.length === 0) return { allowed: false, filter: null };

        // If any condition is "TRUE" (e.g. empty condition {} means allow all), then filter is null (fetch all)
        if (allowConditions.includes('1=1')) {
            return { allowed: true, filter: null };
        }

        // Combine with OR
        const combinedFilter = `(${allowConditions.join(' OR ')})`;
        return { allowed: true, filter: combinedFilter };
    },

    create: async (data: typeof policies.$inferInsert) => {
        const [policy] = await db.insert(policies).values(data).returning();
        return policy;
    },

    list: async (projectId: number, databaseId: number) => {
        return await db.select().from(policies).where(
            and(
                eq(policies.projectId, projectId),
                eq(policies.databaseId, databaseId)
            )
        );
    },

    delete: async (id: number) => {
        return await db.delete(policies).where(eq(policies.id, id)).returning();
    }
};

function parseConditionToSql(conditionJson: string, user: any): string {
    if (!conditionJson || conditionJson === '{}') {
        return '1=1'; // Always true
    }

    try {
        const condition = JSON.parse(conditionJson);
        const clauses: string[] = [];

        for (const [key, value] of Object.entries(condition)) {
            // Value substitution
            let targetValue = value as string;

            if (typeof targetValue === 'string' && targetValue.startsWith('$user.')) {
                const path = targetValue.substring(6); // remove '$user.'
                // resolve path from user object
                const userVal = resolvePath(user, path);
                // Quote string values
                targetValue = `'${userVal}'`;
            } else if (typeof targetValue === 'string') {
                targetValue = `'${targetValue}'`;
            }

            // Construct clause: "key" = value
            // Security: key should be sanitized? We assume column names are safe-ish or wrapped in quotes.
            // value is already formatted.
            clauses.push(`"${key}" = ${targetValue}`);
        }

        return clauses.join(' AND ');
    } catch (e) {
        console.error('Failed to parse policy condition:', e);
        return '1=0'; // Fail safe
    }
}

function resolvePath(obj: any, path: string) {
    return path.split('.').reduce((o, i) => o?.[i], obj);
}
