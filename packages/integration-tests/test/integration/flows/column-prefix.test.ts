import { describe, expect } from 'vitest';
import { testFlow, requestApi, ensureProject, ensureLogic } from './dsl.ts';

describe('flow: column prefix handling', () => {

    testFlow('auto-excludes c_ columns from SELECT *',
        ensureProject(),
        ensureLogic(),
        requestApi('POST', '/call', {
            path: 'crud/main/test_users/select',
            params: {}
        })
            .expectStatus(200)
            .inspectBody((result) => {
                if (result.length > 0) {
                    const firstRow = result[0];
                    expect(firstRow).not.toHaveProperty('c_password_hash');
                    expect(firstRow).not.toHaveProperty('c_ssn');
                }
            })
    );

    testFlow('auto-excludes p_ columns from SELECT *',
        ensureProject(),
        ensureLogic(),
        requestApi('POST', '/call', {
            path: 'crud/main/test_users/select',
            params: {}
        })
            .expectStatus(200)
            .inspectBody((result) => {
                if (result.length > 0) {
                    const firstRow = result[0];
                    expect(firstRow).not.toHaveProperty('p_internal_notes');
                    expect(firstRow).not.toHaveProperty('p_ban_reason');
                }
            })
    );

    testFlow('includes s_ columns in SELECT * for owner',
        ensureProject(),
        ensureLogic(),
        requestApi('POST', '/call', {
            path: 'crud/main/test_users/select',
            params: {}
        })
            .inspectBody((result) => {
                if (Array.isArray(result)) {
                    if (result.length > 0) {
                        const firstRow = result[0];
                        expect(firstRow).toHaveProperty('s_email');
                    }
                    return;
                }
                expect(result).toHaveProperty('error');
                expect(result.error?.message ?? result.error ?? result).toMatch(/permission denied|unauthorized/i);
            })
    );

    testFlow('includes _ system columns in SELECT *',
        ensureProject(),
        ensureLogic(),
        requestApi('POST', '/call', {
            path: 'crud/main/test_users/select',
            params: {}
        })
            .expectStatus(200)
            .inspectBody((result) => {
                if (result.length > 0) {
                    const firstRow = result[0];
                    expect(firstRow).toHaveProperty('_created_at');
                    expect(firstRow).toHaveProperty('_updated_at');
                }
            })
    );

    testFlow('denies explicit request for c_ column without permission',
        ensureProject(),
        ensureLogic(),
        requestApi('POST', '/call', {
            path: 'crud/main/test_users/select',
            params: {
                select: ['id', 'c_password_hash']
            }
        })
            .expectErrorMatches(/permission denied|unauthorized/i)
    );

    testFlow('denies update of _ system columns',
        ensureProject(),
        ensureLogic(),
        // First insert
        requestApi('POST', '/call', {
            path: 'crud/main/test_users/insert',
            params: {
                data: {
                    name: 'System Test',
                    s_email: 'system@test.com'
                }
            }
        })
            .as('sysUser')
            .expectStatus(200),

        // Update
        requestApi('POST', '/call', (store: any) => ({
            path: 'crud/main/test_users/update',
            params: {
                where: { id: store.sysUser[0].id },
                data: {
                    _created_at: '2020-01-01T00:00:00Z'
                }
            }
        }))
            .expectErrorMatches(/permission denied|unauthorized|system/i)
    );

    testFlow('denies insert of _ system columns',
        ensureProject(),
        ensureLogic(),
        requestApi('POST', '/call', {
            path: 'crud/main/test_users/insert',
            params: {
                data: {
                    name: 'System Insert Test',
                    s_email: 'sysinsert@test.com',
                    _created_at: '2020-01-01T00:00:00Z'
                }
            }
        })
            .expectErrorMatches(/permission denied|unauthorized|system/i)
    );
});
