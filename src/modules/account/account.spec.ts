import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { accountService } from './account.service.js'
import { projectService } from '../project/project.service.js'
import { databaseService } from '../database/database.service.js'
import { sql, Kysely, PostgresDialect } from 'kysely'
import type { Pool } from 'pg'

interface UserRecord {
  id: string
  email: string
  password: string
  roles: string[] | null
  name?: string | null
}

// Mock everything first
vi.mock('../../db/index.js', async () => {
  const { createTestDb } = await import('../../tests/db-setup.js')
  const { db, pool } = await createTestDb()
  return { db, pool }
})

vi.mock('../../db/connection-manager.js', async () => {
  const { createTestDb } = await import('../../tests/db-setup.js')
  const { db, pool } = await createTestDb()
  const { PostgresAdapter } = await import('../../db/adapters/postgres-adapter.js')

  return {
    connectionManager: {
      getConnection: vi.fn().mockResolvedValue(db),
      getAdapter: vi.fn().mockReturnValue(new PostgresAdapter())
    },
    // We export these for the test file to use if needed
    projectPool: pool,
    projectDb: db
  }
})

import * as dbModule from '@/db/index.js'
import * as cmModule from '@/db/connection-manager.js'

const { db, pool: systemPool } = dbModule as any
const { projectPool, projectDb } = cmModule as any

describe('User Service (Project Level)', () => {
  let projectId1: string
  let projectId2: string

  beforeEach(async () => {
    // Robust Cleanup
    const { clearDb } = await import('@/tests/test-utils.js')
    await clearDb(db)

    // Re-apply schema - clearDb deletes rows, so no need to re-apply schema if we don't drop it.
    // But original code dropped schema. Now we just delete rows.
    // So we don't need applySchema.

    // However, if tests assume clean slate including schema, clearDb does that.

    // Create initial setup
    const p1 = await projectService.create('Project 1')
    await databaseService.create(p1.id, 'default', 'memory', 'santoki_')

    const p2 = await projectService.create('Project 2')
    await databaseService.create(p2.id, 'default', 'memory', 'santoki_')

    projectId1 = p1.id
    projectId2 = p2.id
  })

  afterAll(async () => {
    if (systemPool) {
      await systemPool.end()
    }
    if (projectPool) {
      await projectPool.end()
    }
  })

  it('should create a user for a project (in physical DB)', async () => {
    const user = await accountService.createUser(projectId1, {
      email: 'test@example.com',
      password: 'password123'
    }, 'users') as UserRecord
    expect(user.email).toBe('test@example.com')

    // Verify it's in the DB (using Kysely)
    const tableName = `santoki_p${projectId1}_users`.toLowerCase()
    const res = await sql.raw(`SELECT * FROM "${tableName}" WHERE email = 'test@example.com'`).execute(projectDb)
    expect(res.rows.length).toBe(1)
  })

  it('should list users for a project', async () => {
    await accountService.createUser(projectId1, {
      email: 'list@example.com',
      password: 'pw'
    }, 'users')
    const list = await accountService.listUsers(projectId1, 'users') as UserRecord[]
    expect(list.length).toBe(1)
    const found = list.find((u: UserRecord) => u.email === 'list@example.com')
    expect(found).toBeDefined()
    expect(found!.roles).toContain('user')
  })

  it('should delete a user', async () => {
    const user = await accountService.createUser(projectId1, {
      email: 'del@example.com',
      password: 'pw'
    }, 'users') as UserRecord
    await accountService.deleteUser(projectId1, user.id, 'users')
    const list = await accountService.listUsers(projectId1, 'users')
    expect(list.length).toBe(0)
  })
})
