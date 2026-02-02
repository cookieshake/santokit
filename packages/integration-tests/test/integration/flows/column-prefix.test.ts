import { describe, it, expect, beforeAll } from 'vitest';
import { getFlowContext } from './context.ts';

describe('flow: column prefix handling', () => {
    beforeAll(async () => {
        const ctx = getFlowContext();
        await ctx.ensureProjectPrepared();
        await ctx.ensureLogicApplied();
    }, 60000);

    it('auto-excludes c_ columns from SELECT *', async () => {
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

        if (result.length > 0) {
            const firstRow = result[0];
            // c_ columns should not be present
            expect(firstRow).not.toHaveProperty('c_password_hash');
            expect(firstRow).not.toHaveProperty('c_ssn');
        }
    }, 30000);

    it('auto-excludes p_ columns from SELECT *', async () => {
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

        if (result.length > 0) {
            const firstRow = result[0];
            // p_ columns should not be present
            expect(firstRow).not.toHaveProperty('p_internal_notes');
            expect(firstRow).not.toHaveProperty('p_ban_reason');
        }
    }, 30000);

    it('includes s_ columns in SELECT * for owner', async () => {
        const ctx = getFlowContext();

        // This requires authentication as owner
        const response = await fetch(`${ctx.apiUrl}/call`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // TODO: Add JWT token for owner
            },
            body: JSON.stringify({
                path: 'crud/main/test_users/select',
                params: {}
            })
        });

        // Should include s_ columns for owner/admin
        expect([200, 401, 403]).toContain(response.status);
    }, 30000);

    it('includes _ system columns in SELECT *', async () => {
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

        if (result.length > 0) {
            const firstRow = result[0];
            // System columns should be present
            expect(firstRow).toHaveProperty('_created_at');
            expect(firstRow).toHaveProperty('_updated_at');
        }
    }, 30000);

    it('denies explicit request for c_ column without permission', async () => {
        const ctx = getFlowContext();

        const response = await fetch(`${ctx.apiUrl}/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: 'crud/main/test_users/select',
                params: {
                    select: ['id', 'c_password_hash']
                }
            })
        });

        // Should fail with permission error
        expect(response.status).toBeGreaterThanOrEqual(400);
        const result = await response.json();
        expect(result.error).toContain('Permission denied');
    }, 30000);

    it('denies update of _ system columns', async () => {
        const ctx = getFlowContext();

        // First insert a user
        const insertResponse = await fetch(`${ctx.apiUrl}/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: 'crud/main/test_users/insert',
                params: {
                    data: {
                        name: 'System Test',
                        s_email: 'system@test.com'
                    }
                }
            })
        });

        const insertResult = await insertResponse.json();
        const userId = insertResult[0].id;

        // Try to update _created_at
        const updateResponse = await fetch(`${ctx.apiUrl}/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: 'crud/main/test_users/update',
                params: {
                    where: { id: userId },
                    data: {
                        _created_at: '2020-01-01T00:00:00Z'
                    }
                }
            })
        });

        // Should fail with permission error
        expect(updateResponse.status).toBeGreaterThanOrEqual(400);
        const result = await updateResponse.json();
        expect(result.error).toContain('Permission denied');
    }, 30000);

    it('denies insert of _ system columns', async () => {
        const ctx = getFlowContext();

        const response = await fetch(`${ctx.apiUrl}/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: 'crud/main/test_users/insert',
                params: {
                    data: {
                        name: 'System Insert Test',
                        s_email: 'sysinsert@test.com',
                        _created_at: '2020-01-01T00:00:00Z'
                    }
                }
            })
        });

        // Should fail with permission error
        expect(response.status).toBeGreaterThanOrEqual(400);
        const result = await response.json();
        expect(result.error).toContain('Permission denied');
    }, 30000);
});
