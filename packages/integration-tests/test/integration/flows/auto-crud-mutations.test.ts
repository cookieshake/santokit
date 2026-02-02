import { describe, it, expect, beforeAll } from 'vitest';
import { getFlowContext } from './context.ts';

describe('flow: auto CRUD mutations', () => {
    beforeAll(async () => {
        const ctx = getFlowContext();
        await ctx.ensureProjectPrepared();
        await ctx.ensureLogicApplied();
    }, 60000);

    it('inserts a new user', async () => {
        const ctx = getFlowContext();

        const response = await fetch(`${ctx.apiUrl}/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: 'crud/main/test_users/insert',
                params: {
                    data: {
                        name: 'New User',
                        s_email: 'newuser@example.com'
                    }
                }
            })
        });

        expect(response.status).toBe(200);
        const result = await response.json();
        expect(Array.isArray(result)).toBe(true);
        expect(result.length).toBeGreaterThan(0);
        expect(result[0]).toHaveProperty('id');
        expect(result[0].name).toBe('New User');
        expect(result[0].s_email).toBe('newuser@example.com');
    }, 30000);

    it('updates a user', async () => {
        const ctx = getFlowContext();

        // First insert a user
        const insertResponse = await fetch(`${ctx.apiUrl}/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: 'crud/main/test_users/insert',
                params: {
                    data: {
                        name: 'Update Test User',
                        s_email: 'update@example.com'
                    }
                }
            })
        });

        const insertResult = await insertResponse.json();
        const userId = insertResult[0].id;

        // Now update it
        const updateResponse = await fetch(`${ctx.apiUrl}/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: 'crud/main/test_users/update',
                params: {
                    where: { id: userId },
                    data: {
                        name: 'Updated User'
                    }
                }
            })
        });

        expect(updateResponse.status).toBe(200);
        const updateResult = await updateResponse.json();
        expect(Array.isArray(updateResult)).toBe(true);
        expect(updateResult[0].name).toBe('Updated User');
    }, 30000);

    it('deletes a user', async () => {
        const ctx = getFlowContext();

        // First insert a user
        const insertResponse = await fetch(`${ctx.apiUrl}/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: 'crud/main/test_users/insert',
                params: {
                    data: {
                        name: 'Delete Test User',
                        s_email: 'delete@example.com'
                    }
                }
            })
        });

        const insertResult = await insertResponse.json();
        const userId = insertResult[0].id;

        // Now delete it
        const deleteResponse = await fetch(`${ctx.apiUrl}/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: 'crud/main/test_users/delete',
                params: {
                    where: { id: userId }
                }
            })
        });

        expect(deleteResponse.status).toBe(200);
        const deleteResult = await deleteResponse.json();
        expect(Array.isArray(deleteResult)).toBe(true);
        expect(deleteResult[0].id).toBe(userId);

        // Verify it's deleted
        const selectResponse = await fetch(`${ctx.apiUrl}/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: 'crud/main/test_users/select',
                params: {
                    where: { id: userId }
                }
            })
        });

        const selectResult = await selectResponse.json();
        expect(selectResult.length).toBe(0);
    }, 30000);

    it('denies insert without permission', async () => {
        const ctx = getFlowContext();

        // Try to insert into a table that requires admin role
        const response = await fetch(`${ctx.apiUrl}/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: 'crud/main/test_admin_only/insert',
                params: {
                    data: {
                        name: 'Unauthorized'
                    }
                }
            })
        });

        // Should fail with permission error or 404 if table doesn't exist
        expect(response.status).toBeGreaterThanOrEqual(400);
    }, 30000);

    it('denies update of system columns', async () => {
        const ctx = getFlowContext();

        // First insert a user
        const insertResponse = await fetch(`${ctx.apiUrl}/call`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                path: 'crud/main/test_users/insert',
                params: {
                    data: {
                        name: 'System Column Test',
                        s_email: 'system@example.com'
                    }
                }
            })
        });

        const insertResult = await insertResponse.json();
        const userId = insertResult[0].id;

        // Try to update _created_at (system column)
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
});
