import { describe, it, expect, beforeEach, vi } from 'vitest'
import { accountService } from './account.service.js'
import { projectService } from '../project/project.service.js'
import { sql } from 'drizzle-orm'

vi.mock('../../db/index.js', async () => {
  const { createTestDb } = await import('../../tests/db-setup.js')
  return await createTestDb()
})

vi.mock('../../db/connection-manager.js', async () => {
  const { createTestDb } = await import('../../tests/db-setup.js')
  const { db, pglite } = await createTestDb()
  return {
    connectionManager: {
      getConnection: vi.fn().mockResolvedValue(db)
    },
    projectPglite: pglite,
    projectDb: db
  }
})

// Correctly import the mocked modules
import * as dbModule from '@/db/index.js'
import * as cmModule from '@/db/connection-manager.js'

const { db, pglite: systemPglite } = dbModule as any
const systemPgliteInstance = systemPglite as any
const { projectPglite, projectDb } = cmModule as any

describe('User Service (Project Level)', () => {
  let projectId1: number
  let projectId2: number

  beforeEach(async () => {
    // Schema is already setup by createTestDb in the mock

    // Clear tables
    await db.execute(sql`TRUNCATE TABLE collections, projects, data_sources, accounts RESTART IDENTITY CASCADE`)
    await projectDb.execute(sql`TRUNCATE TABLE accounts RESTART IDENTITY CASCADE`)
    // No need to try users separately now it's consolidated

    // Create initial setup
    await systemPgliteInstance.exec(`
      INSERT INTO accounts (id, name, email, password, roles, email_verified, created_at, updated_at) 
      VALUES ('admin-1', 'Admin', 'admin@example.com', 'password', '{"admin"}', true, NOW(), NOW())
    `)
    await systemPgliteInstance.exec(`INSERT INTO data_sources (name, connection_string) VALUES ('ds1', 'memory'), ('ds2', 'memory')`)

    const p1 = await projectService.create('Project 1', 1)
    const p2 = await projectService.create('Project 2', 2)

    projectId1 = p1.id
    projectId2 = p2.id
  })

  it('should create a user for a project (in physical DB)', async () => {
    const user = await accountService.createUser(projectId1, {
      email: 'test@example.com',
      password: 'password123'
    })
    expect(user.email).toBe('test@example.com')

    // Verify it's in the DB (which is projectPglite)
    const res = await projectPglite.query(`SELECT * FROM accounts WHERE email = 'test@example.com'`)
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
