import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { databaseService } from '@/modules/database/database.service.js'
import { databaseRepository } from '@/modules/database/database.repository.js'
import { sql, Kysely, PostgresDialect } from 'kysely'
import type { Pool } from 'pg'

let testPool: Pool

vi.mock('../../db/index.js', async () => {
    const { createTestDb } = await import('../../tests/db-setup.js')
    const { db, pool } = await createTestDb()
    return { db, pool }
})

vi.mock('../../db/connection-manager.js', async () => {
    const { Kysely, PostgresDialect } = await import('kysely')
    const { pool } = await import('../../db/index.js') as any
    const db = new Kysely({
        dialect: new PostgresDialect({ pool }),
    })
    return {
        connectionManager: {
            getConnection: vi.fn().mockResolvedValue(db)
        }
    }
})

// Correctly import the mocked modules
import * as dbModule from '@/db/index.js'
import { connectionManager } from '@/db/connection-manager.js'
const { db, pool } = dbModule as any

// Import project service to create test projects
import { projectService } from '@/modules/project/project.service.js'

describe('Database Service (Integration)', () => {
    beforeEach(async () => {
        // Schema is already setup by createTestDb in the mock
        // Clear tables
        await sql`TRUNCATE TABLE projects, accounts RESTART IDENTITY CASCADE`.execute(db)

        // Create a dummy user
        const dummyId = 'user-1'
        await sql`
      INSERT INTO accounts (id, name, email, password, created_at, updated_at) 
      VALUES (${dummyId}, 'Test User', 'test@example.com', 'pass123', NOW(), NOW())
    `.execute(db)
    })

    afterAll(async () => {
        if (pool) {
            await pool.end()
        }
    })

    it('should create a database for project', async () => {
        const project = await projectService.create('Test Project')
        const database = await databaseService.create(project.id, 'default', 'postgresql://localhost/test', 'p_')

        expect(database).toBeDefined()
        expect(database.name).toBe('default')
        expect(database.project_id).toBe(project.id)
        expect(database.connection_string).toBe('postgresql://localhost/test')
        expect(database.prefix).toBe('p_')
    })

    it('should list databases by project', async () => {
        const project = await projectService.create('Test Project')
        await databaseService.create(project.id, 'db1', 'postgresql://localhost/db1', 'p1_')
        await databaseService.create(project.id, 'db2', 'postgresql://localhost/db2', 'p2_')

        const databases = await databaseService.listByProject(project.id)
        expect(databases.length).toBe(2)
        expect(databases[0].name).toBe('db1')
        expect(databases[1].name).toBe('db2')
    })

    it('should get database by id', async () => {
        const project = await projectService.create('Test Project')
        const created = await databaseService.create(project.id, 'default', 'postgresql://localhost/test', 'p_')

        const database = await databaseService.getById(created.id)
        expect(database).toBeDefined()
        expect(database?.id).toBe(created.id)
        expect(database?.name).toBe('default')
    })
})
