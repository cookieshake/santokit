import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '@/db/schema.js'
import { projectService } from '@/modules/project/project.service.js'
import { projectRepository } from '@/modules/project/project.repository.js'
import { sql } from 'drizzle-orm'

vi.mock('../../db/index.js', async () => {
  const { createTestDb } = await import('../../tests/db-setup.js')
  return await createTestDb()
})

vi.mock('../../db/connection-manager.js', async () => {
  const { drizzle } = await import('drizzle-orm/pglite')
  const { pglite } = await import('../../db/index.js') as any
  const db = drizzle(pglite)
  return {
    connectionManager: {
      getConnection: vi.fn().mockResolvedValue(db)
    }
  }
})

// Correctly import the mocked modules
import * as dbModule from '@/db/index.js'
import { connectionManager } from '@/db/connection-manager.js'
const { db, pglite } = dbModule as any
const pgliteInstance = pglite as any


describe('Project Service (Integration)', () => {
  beforeEach(async () => {
    // Basic table creation for tests (since we don't have migrations)
    // Schema is already setup by createTestDb in the mock
    // Clear tables
    await db.execute(sql`TRUNCATE TABLE projects, accounts RESTART IDENTITY CASCADE`)

    // Create a dummy user
    const dummyId = 'user-1'
    await pgliteInstance.exec(`
      INSERT INTO accounts (id, name, email, password, created_at, updated_at) 
      VALUES ('${dummyId}', 'Test User', 'test@example.com', 'pass123', NOW(), NOW())
    `)
  })


  it('should create a new project', async () => {
    const project = await projectService.create('New Project', 'pglite://memory')
    expect(project).toBeDefined()
    expect(project.name).toBe('New Project')
    expect(project.connectionString).toBe('pglite://memory')
  })

  it('should list projects', async () => {
    await projectService.create('Project 1', 'pglite://memory')
    await projectService.create('Project 2', 'pglite://memory/2')

    const projects = await projectService.list()
    expect(projects.length).toBe(2)
    expect(projects[0].name).toBe('Project 1')
  })

  it('should have a connection string upon creation', async () => {
    const project = await projectService.create('To Check', 'pglite://memory')
    expect(project.connectionString).toBe('pglite://memory')
  })

  it('should create a project with correct prefix', async () => {
    const project = await projectService.create('Project with Prefix', 'pglite://memory', 'p_')
    expect(project).toBeDefined()
    expect(project.prefix).toBe('p_')

    const found = await projectService.getById(project.id)
    expect(found?.prefix).toBe('p_')
  })
})
