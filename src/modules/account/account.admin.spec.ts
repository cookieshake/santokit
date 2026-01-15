import { describe, it, expect, beforeEach, vi } from 'vitest'
import { accountService } from './account.service.js'
import { db } from '@/db/index.js'
import { accounts } from '@/db/schema.js'
import { sql } from 'drizzle-orm'

vi.mock('@/db/index.js', async () => {
    const { createTestDb } = await import('../../tests/db-setup.js')
    return await createTestDb()
})

const { db: mockedDb } = await import('@/db/index.js') as any

describe('Account Module (System Admin)', () => {
    beforeEach(async () => {
        // Schema is already setup by createTestDb in the mock
        // Clear tables
        await mockedDb.execute(sql`TRUNCATE TABLE accounts RESTART IDENTITY CASCADE`)
    })

    it('should register a new admin in system project', async () => {
        const admin = await accountService.createUser('system', {
            email: 'admin@example.com',
            password: 'password123',
            roles: ['admin']
        })
        expect(admin.email).toBe('admin@example.com')
        // We need to check if roles are persisted. accountRepository.create inserts them.
        expect(admin.roles).toContain('admin')
    })

    it('should NOT allow registering duplicate email', async () => {
        await accountService.createUser('system', {
            email: 'admin@example.com',
            password: 'password123',
            roles: ['admin']
        })
        await expect(accountService.createUser('system', {
            email: 'admin@example.com',
            password: 'passother',
            roles: ['admin']
        })).rejects.toThrow()
    })
})
