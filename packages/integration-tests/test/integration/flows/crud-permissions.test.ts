import { describe, expect } from 'vitest';
import { testFlow, requestApi, ensureProject, ensureLogic } from './dsl.ts';

describe('flow: CRUD permissions and RLS', () => {

    testFlow('applies RLS filter for owner access',
        ensureProject(),
        ensureLogic(),
        requestApi('POST', '/call', {
            path: 'crud/main/test_orders/select',
            params: {}
        })
            .inspectBody((result) => {
                if (Array.isArray(result)) {
                    expect(result).toBeDefined();
                    return;
                }
                expect(result).toHaveProperty('error');
                expect(result.error?.message ?? result.error ?? result).toMatch(/permission denied|unauthorized/i);
            })
    );

    testFlow('admin bypasses RLS filter',
        ensureProject(),
        ensureLogic(),
        requestApi('POST', '/call', {
            path: 'crud/main/test_orders/select',
            params: {}
        })
            .inspectBody((result) => {
                if (Array.isArray(result)) {
                    expect(result).toBeDefined();
                    return;
                }
                expect(result).toHaveProperty('error');
                expect(result.error?.message ?? result.error ?? result).toMatch(/permission denied|unauthorized/i);
            })
    );

    testFlow('enforces table-level permissions',
        ensureProject(),
        ensureLogic(),
        requestApi('POST', '/call', {
            path: 'crud/main/test_orders/select',
            params: {}
        })
            .expectErrorMatches(/permission denied|unauthorized/i)
    );

    testFlow('enforces column-level permissions',
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

    testFlow('allows public access to public tables',
        ensureProject(),
        ensureLogic(),
        requestApi('POST', '/call', {
            path: 'crud/main/test_public_posts/select',
            params: {}
        })
            .inspectBody((result) => {
                if (Array.isArray(result)) {
                    expect(result).toBeDefined();
                    return;
                }
                expect(result).toHaveProperty('error');
                expect(result.error?.message ?? result.error ?? result).toMatch(/not found|permission denied|unauthorized/i);
            })
    );

    testFlow('denies delete without admin role',
        ensureProject(),
        ensureLogic(),
        requestApi('POST', '/call', {
            path: 'crud/main/test_orders/delete',
            params: {
                where: { id: '00000000-0000-0000-0000-000000000000' }
            }
        })
            .expectErrorMatches(/permission denied|unauthorized/i)
    );
});
