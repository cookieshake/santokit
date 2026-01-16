import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { accountService } from './account.service.js'
import { projectService } from '../project/project.service.js'
import { sql } from 'drizzle-orm'
import type { Pool } from 'pg'

// Mock everything first
vi.mock('../../db/index.js', async () => {
  const { createTestDb } = await import('../../tests/db-setup.js')
  const { db, pool } = await createTestDb()
  return { db, pool }
})

vi.mock('../../db/connection-manager.js', async () => {
  const { createTestDb } = await import('../../tests/db-setup.js')
  const { db, pool } = await createTestDb()
  // We need to return the SAME db instance as above?
  // Ideally yes. But here we create NEW instance?
  // `createTestDb` in `db-setup.ts` reuses global container, but creates NEW pool each time.
  // This means `db` in `index.js` mock is DIFFERENT from `db` in `connection-manager.js` mock!!
  // This causes split brain if used in same test.
  // `account.spec.ts` logic relies on `db` and `projectDb` being potentially separate or same?
  // The test logic: `await db.execute(...)` (setup) then `accountService` uses `connectionManager (projectDb)`.
  // If they are different pools on same container: it works (shared DB state).
  // But if we drop schema in one, it affects other.
  // The previous implementation imported `createTestDb` and called it twice.
  // So we stick to that pattern for now, assuming they share the container.
  return {
    connectionManager: {
      getConnection: vi.fn().mockResolvedValue(db)
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
  let projectId1: number
  let projectId2: number

  beforeEach(async () => {
    // Robust Cleanup: Drop schema
    await db.execute(sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;`)

    // Re-apply schema
    const { pushSchema } = await import('drizzle-kit/api');
    const schema = await import('@/db/schema.js');
    const { apply } = await pushSchema(schema, db);
    await apply();

    // Create initial setup
    const p1 = await projectService.create('Project 1', 'memory')
    const p2 = await projectService.create('Project 2', 'memory')

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
    })
    expect(user.email).toBe('test@example.com')

    // Verify it's in the DB (using Drizzle ORM)
    const tableName = `santoki_p${projectId1}_users`.toLowerCase()
    const res = await projectDb.execute(sql.raw(`SELECT * FROM "${tableName}" WHERE email = 'test@example.com'`))
    expect(res.rows.length).toBe(1)
  })

  it('should list users for a project', async () => {
    await accountService.createUser(projectId1, {
      email: 'list@example.com',
      password: 'pw'
    })
    const list = await accountService.listUsers(projectId1)
    expect(list.length).toBe(1)
    const found = list.find(u => u.email === 'list@example.com')
    expect(found).toBeDefined()
    expect(found!.roles).toContain('user')
  })

  it('should delete a user', async () => {
    const user = await accountService.createUser(projectId1, {
      email: 'del@example.com',
      password: 'pw'
    })
    await accountService.deleteUser(projectId1, user.id as number)
    const list = await accountService.listUsers(projectId1)
    expect(list.length).toBe(0)
  })
})
