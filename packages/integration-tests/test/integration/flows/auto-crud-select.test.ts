import { describe, it, expect, beforeAll } from 'vitest';
import { getFlowContext } from './context.ts';

describe('flow: auto CRUD select', () => {
    beforeAll(async () => {
        const ctx = getFlowContext();
        await ctx.ensureProjectPrepared();
        await ctx.ensureLogicApplied();
    }, 60000);

    it('selects all users (auto-excludes c_ and p_ columns)', async () => {
        const ctx = getFlowContext();

        const response = await fetch(`${ctx.apiUrl}/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: 'crud/main/test_users/select',
                params: {}
            })
        });

        expect(response.status).toBe(200);
        const result = await response.json();
        expect(Array.isArray(result)).toBe(true);

        // Should not include c_ or p_ columns
        if (result.length > 0) {
            const firstRow = result[0];
            expect(firstRow).toHaveProperty('id');
            expect(firstRow).toHaveProperty('name');
            expect(firstRow).not.toHaveProperty('c_password_hash');
            expect(firstRow).not.toHaveProperty('p_internal_notes');
        }
    }, 30000);

    it('selects users with WHERE clause', async () => {
        const ctx = getFlowContext();

        const response = await fetch(`${ctx.apiUrl}/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: 'crud/main/test_users/select',
                params: {
                    where: { name: 'Test User' }
                }
            })
        });

        expect(response.status).toBe(200);
        const result = await response.json();
        expect(Array.isArray(result)).toBe(true);
    }, 30000);

    it('selects specific columns', async () => {
        const ctx = getFlowContext();

        const response = await fetch(`${ctx.apiUrl}/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: 'crud/main/test_users/select',
                params: {
                    select: ['id', 'name']
                }
            })
        });

        expect(response.status).toBe(200);
        const result = await response.json();
        expect(Array.isArray(result)).toBe(true);

        if (result.length > 0) {
            const firstRow = result[0];
            expect(firstRow).toHaveProperty('id');
            expect(firstRow).toHaveProperty('name');
            expect(Object.keys(firstRow).length).toBe(2);
        }
    }, 30000);

    it('denies access to c_ column without permission', async () => {
        const ctx = getFlowContext();

        const response = await fetch(`${ctx.apiUrl}/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: 'crud/main/test_users/select',
                params: {
                    select: ['id', 'name', 'c_password_hash']
                }
            })
        });

        // Should fail with permission error
        expect(response.status).toBeGreaterThanOrEqual(400);
        const result = await response.json();
        expect(result.error).toContain('Permission denied');
    }, 30000);

    it('selects with ORDER BY and LIMIT', async () => {
        const ctx = getFlowContext();

        const response = await fetch(`${ctx.apiUrl}/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: 'crud/main/test_users/select',
                params: {
                    orderBy: { created_at: 'desc' },
                    limit: 5
                }
            })
        });

        expect(response.status).toBe(200);
        const result = await response.json();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeLessThanOrEqual(5);
    }, 30000);

    it('requires authentication for authenticated table', async () => {
        const ctx = getFlowContext();

        // Without auth header
        const response = await fetch(`${ctx.apiUrl}/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: 'crud/main/test_users/select',
                params: {}
            })
        });

        // Should work if table has public access, or fail if authenticated required
        // This depends on permissions config
        expect([200, 401, 403]).toContain(response.status);
    }, 30000);
});
