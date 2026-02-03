import { describe, expect } from 'vitest';
import { testFlow, requestApi, ensureProject, ensureLogic } from './dsl.ts';

describe('flow: auto CRUD select', () => {

    testFlow('selects all users (auto-excludes c_ and p_ columns)',
        ensureProject(),
        ensureLogic(),
        requestApi('POST', '/call', {
            path: 'crud/main/test_users/select',
            params: {}
        })
            .expectStatus(200)
            .inspectBody((result) => {
                expect(Array.isArray(result)).toBe(true);
                if (result.length > 0) {
                    const firstRow = result[0];
                    expect(firstRow).toHaveProperty('id');
                    expect(firstRow).toHaveProperty('name');
                    expect(firstRow).not.toHaveProperty('c_password_hash');
                    expect(firstRow).not.toHaveProperty('p_internal_notes');
                }
            })
    );

    testFlow('selects users with WHERE clause',
        ensureProject(),
        ensureLogic(),
        requestApi('POST', '/call', {
            path: 'crud/main/test_users/select',
            params: {
                where: { name: 'Test User' }
            }
        })
            .expectStatus(200)
            .inspectBody((result) => {
                expect(Array.isArray(result)).toBe(true);
            })
    );

    testFlow('selects specific columns',
        ensureProject(),
        ensureLogic(),
        requestApi('POST', '/call', {
            path: 'crud/main/test_users/select',
            params: {
                select: ['id', 'name']
            }
        })
            .expectStatus(200)
            .inspectBody((result) => {
                expect(Array.isArray(result)).toBe(true);
                if (result.length > 0) {
                    const firstRow = result[0];
                    expect(firstRow).toHaveProperty('id');
                    expect(firstRow).toHaveProperty('name');
                    expect(Object.keys(firstRow).length).toBe(2);
                }
            })
    );

    testFlow('denies access to c_ column without permission',
        ensureProject(),
        ensureLogic(),
        requestApi('POST', '/call', {
            path: 'crud/main/test_users/select',
            params: {
                select: ['id', 'name', 'c_password_hash']
            }
        })
            .expectErrorMatches(/permission denied|unauthorized/i)
    );

    testFlow('selects with ORDER BY and LIMIT',
        ensureProject(),
        ensureLogic(),
        requestApi('POST', '/call', {
            path: 'crud/main/test_users/select',
            params: {
                orderBy: { _created_at: 'desc' },
                limit: 5
            }
        })
            .expectStatus(200)
            .inspectBody((result) => {
                expect(Array.isArray(result)).toBe(true);
                expect(result.length).toBeLessThanOrEqual(5);
            })
    );

    testFlow('requires authentication for authenticated table',
        ensureProject(),
        ensureLogic(),
        requestApi('POST', '/call', {
            path: 'crud/main/test_orders/select',
            params: {}
        })
            .expectErrorMatches(/permission denied|unauthorized/i)
    );
});
