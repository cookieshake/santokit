import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { accountService } from './account.service.js'
import { projectService } from '../project/project.service.js'
import { CONSTANTS } from '@/constants.js'
import { clearDb } from '@/tests/test-utils.js'
import { sql } from 'drizzle-orm'
import type { Pool } from 'pg'

// Mock everything first
vi.mock('@/db/index.js', async () => {
    const { createTestDb } = await import('../../tests/db-setup.js')
    const { db, pool } = await createTestDb()
    return { db, pool }
})

vi.mock('../../db/connection-manager.js', async () => {
    const { createTestDb } = await import('../../tests/db-setup.js')
    const { db } = await createTestDb()
    return {
        connectionManager: {
            getConnection: vi.fn().mockResolvedValue(db)
        }
    }
})

const { db: mockedDb, pool } = await import('@/db/index.js') as any

describe('Account Module (System Admin)', () => {
    beforeEach(async () => {
        // Use robust cleanup
        await clearDb(mockedDb)

        // Create System Project
        await projectService.create(CONSTANTS.PROJECTS.SYSTEM_ID, 'postgres://system-db-connection')
    })

    afterAll(async () => {
        if (pool) {
            await pool.end()
        }
    })

    it('should register a new admin in system project', async () => {
        const admin = await accountService.createUser(CONSTANTS.PROJECTS.SYSTEM_ID, {
            email: 'admin@example.com',
            password: 'password123',
            roles: ['admin']
        })
        expect(admin.email).toBe('admin@example.com')
        expect(admin.roles).toContain('admin')
    })

    it('should NOT allow registering duplicate email', async () => {
        await accountService.createUser(CONSTANTS.PROJECTS.SYSTEM_ID, {
            email: 'admin@example.com',
            password: 'password123',
            roles: ['admin']
        })
        await expect(accountService.createUser(CONSTANTS.PROJECTS.SYSTEM_ID, {
            email: 'admin@example.com',
            password: 'passother',
            roles: ['admin']
        })).rejects.toThrow()
    })
})
