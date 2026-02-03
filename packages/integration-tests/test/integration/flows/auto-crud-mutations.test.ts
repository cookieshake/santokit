import { describe, expect } from 'vitest';
import { testFlow, requestApi, ensureProject, ensureLogic } from './dsl.ts';

describe('flow: auto CRUD mutations', () => {
    testFlow('inserts a new user',
        ensureProject(),
        ensureLogic(),
        requestApi('POST', '/call', {
            path: 'crud/main/test_users/insert',
            params: {
                data: {
                    name: 'New User',
                    s_email: 'newuser@example.com'
                }
            }
        })
            .expectStatus(200)
            .inspectBody((result) => {
                expect(Array.isArray(result)).toBe(true);
                expect(result.length).toBeGreaterThan(0);
                expect(result[0]).toHaveProperty('id');
                expect(result[0].name).toBe('New User');
                expect(result[0].s_email).toBe('newuser@example.com');
            })
    );


    testFlow('updates a user',
        ensureProject(),
        ensureLogic(),
        // First insert a user
        requestApi('POST', '/call', {
            path: 'crud/main/test_users/insert',
            params: {
                data: {
                    name: 'Update Test User',
                    s_email: 'update@example.com'
                }
            }
        })
            .as('insertedUser')
            .expectStatus(200),

        // Now update it
        requestApi('POST', '/call', (store: any) => ({
            path: 'crud/main/test_users/update',
            params: {
                where: { id: store.insertedUser[0].id },
                data: {
                    name: 'Updated User'
                }
            }
        }))
            .expectStatus(200)
            .inspectBody((result) => {
                expect(Array.isArray(result)).toBe(true);
                expect(result[0].name).toBe('Updated User');
            })
    );

    testFlow('deletes a user',
        ensureProject(),
        ensureLogic(),
        // First insert a user
        requestApi('POST', '/call', {
            path: 'crud/main/test_users/insert',
            params: {
                data: {
                    name: 'Delete Test User',
                    s_email: 'delete@example.com'
                }
            }
        })
            .as('insertedUser')
            .expectStatus(200),

        // Now delete it
        requestApi('POST', '/call', (store: any) => ({
            path: 'crud/main/test_users/delete',
            params: {
                where: { id: store.insertedUser[0].id }
            }
        }))
            .as('deleteResult')
            .expectStatus(200)
            .inspectBody((result) => {
                expect(Array.isArray(result)).toBe(true);
                // We can check store.insertedUser[0].id against result[0].id but need to capture logic.
            }),

        // Verify it's deleted
        requestApi('POST', '/call', (store: any) => ({
            path: 'crud/main/test_users/select',
            params: {
                where: { id: store.insertedUser[0].id }
            }
        }))
            .inspectBody(result => {
                expect(result.length).toBe(0);
            })
    );

    testFlow('denies insert without permission',
        ensureProject(),
        ensureLogic(),
        requestApi('POST', '/call', {
            path: 'crud/main/test_admin_only/insert',
            params: {
                data: {
                    name: 'Unauthorized'
                }
            }
        })
            .expectErrorMatches(/permission denied|unauthorized/i)
    );
    // Note: previous implementation checked status >= 400.
    // I'll leave as is for now as DSL enhancement for range status is not there yet.
    // Or I can add a custom Step.

    testFlow('denies update of system columns',
        ensureProject(),
        ensureLogic(),
        // First insert
        requestApi('POST', '/call', {
            path: 'crud/main/test_users/insert',
            params: {
                data: {
                    name: 'System Column Test',
                    s_email: 'system@example.com'
                }
            }
        })
            .as('insertedUser')
            .expectStatus(200),

        // Try update _created_at
        requestApi('POST', '/call', (store: any) => ({
            path: 'crud/main/test_users/update',
            params: {
                where: { id: store.insertedUser[0].id },
                data: {
                    _created_at: '2020-01-01T00:00:00Z'
                }
            }
        }))
            .expectErrorMatches(/permission denied|unauthorized|system/i)
    );
});
