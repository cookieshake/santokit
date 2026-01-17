import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { projectService } from '@/modules/project/project.service.js'
import { projectRepository } from '@/modules/project/project.repository.js'
import { sql, Kysely, PostgresDialect } from 'kysely'
import type { Pool } from 'pg'

let testPool: Pool

vi.mock('../../db/index.js', async () => {
  const { createTestDb } = await import('../../tests/db-setup.js')
  const { db, pool } = await createTestDb()
  // removed testPool assignment
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


describe('Project Service (Integration)', () => {
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

  it('should create a new project', async () => {
    const project = await projectService.create('New Project', 'postgresql://localhost/test')
    expect(project).toBeDefined()
    expect(project.name).toBe('New Project')

    // Check Database
    const databases = await projectRepository.findDatabasesByProjectId(project.id)
    expect(databases.length).toBe(1)
    expect(databases[0].connection_string).toBe('postgresql://localhost/test')
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
    const databases = await projectRepository.findDatabasesByProjectId(project.id)
    expect(databases[0].connection_string).toBe('postgresql://localhost/test')
  })

  it('should create a project with correct prefix', async () => {
    const project = await projectService.create('Project with Prefix', 'postgresql://localhost/test', 'p_')
    expect(project).toBeDefined()

    const databases = await projectRepository.findDatabasesByProjectId(project.id)
    expect(databases[0].prefix).toBe('p_')
  })
})
