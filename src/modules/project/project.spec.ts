import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import * as schema from '@/db/schema.js'
import { projectService } from '@/modules/project/project.service.js'
import { projectRepository } from '@/modules/project/project.repository.js'
import { sql } from 'drizzle-orm'
import type { Pool } from 'pg'

let testPool: Pool

vi.mock('../../db/index.js', async () => {
  const { createTestDb } = await import('../../tests/db-setup.js')
  const { db, pool } = await createTestDb()
  testPool = pool
  return { db, pool }
})

vi.mock('../../db/connection-manager.js', async () => {
  const { drizzle } = await import('drizzle-orm/node-postgres')
  const { pool } = await import('../../db/index.js') as any
  const db = drizzle(pool)
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


describe('Project Service (Integration)', () => {
  beforeEach(async () => {
    // Schema is already setup by createTestDb in the mock
    // Clear tables
    await db.execute(sql`TRUNCATE TABLE projects, accounts RESTART IDENTITY CASCADE`)

    // Create a dummy user
    const dummyId = 'user-1'
    await db.execute(sql`
      INSERT INTO accounts (id, name, email, password, created_at, updated_at) 
      VALUES (${dummyId}, 'Test User', 'test@example.com', 'pass123', NOW(), NOW())
    `)
  })

  afterAll(async () => {
    if (testPool) {
      await testPool.end()
    }
  })

  it('should create a new project', async () => {
    const project = await projectService.create('New Project', 'postgresql://localhost/test')
    expect(project).toBeDefined()
    expect(project.name).toBe('New Project')
    expect(project.connectionString).toBe('postgresql://localhost/test')
  })

  it('should list projects', async () => {
    await projectService.create('Project 1', 'postgresql://localhost/test1')
    await projectService.create('Project 2', 'postgresql://localhost/test2')

    const projects = await projectService.list()
    expect(projects.length).toBe(2)
    expect(projects[0].name).toBe('Project 1')
  })

  it('should have a connection string upon creation', async () => {
    const project = await projectService.create('To Check', 'postgresql://localhost/test')
    expect(project.connectionString).toBe('postgresql://localhost/test')
  })

  it('should create a project with correct prefix', async () => {
    const project = await projectService.create('Project with Prefix', 'postgresql://localhost/test', 'p_')
    expect(project).toBeDefined()
    expect(project.prefix).toBe('p_')

    const found = await projectService.getById(project.id)
    expect(found?.prefix).toBe('p_')
  })
})
