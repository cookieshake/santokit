import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '@/db/schema.js'
import { projectService } from '@/modules/project/project.service.js'
import { projectRepository } from '@/modules/project/project.repository.js'
import { sql } from 'drizzle-orm'

vi.mock('../../db/index.js', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const schema = await import('../../db/schema.js')
  const pglite = new PGlite()
  const db = drizzle(pglite, { schema })
  return { db, pglite }
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
    await pgliteInstance.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        owner_id TEXT REFERENCES users(id),
        data_source_id INTEGER UNIQUE,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `)

    // Clear tables
    await db.execute(sql`TRUNCATE TABLE projects, users RESTART IDENTITY CASCADE`)

    // Create a dummy user
    const dummyId = 'user-1'
    await pgliteInstance.exec(`INSERT INTO users (id, email, password) VALUES ('${dummyId}', 'test@example.com', 'pass123')`)
  })


  it('should create a new project', async () => {
    const project = await projectService.create('New Project', 'user-1')
    expect(project).toBeDefined()
    expect(project.name).toBe('New Project')
    expect(project.ownerId).toBe('user-1')
  })

  it('should list projects', async () => {
    await projectService.create('Project 1', 'user-1')
    await projectService.create('Project 2', 'user-1')

    const projects = await projectService.list()
    expect(projects.length).toBe(2)
    expect(projects[0].name).toBe('Project 1')
  })

  it('should associate a data source', async () => {
    // 1. Create a project
    const project = await projectService.create('To Associate', 'user-1')

    // 2. Mock datasource existence (we need to create it in test DB too)
    await pgliteInstance.exec(`
      CREATE TABLE IF NOT EXISTS data_sources (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        connection_string TEXT NOT NULL,
        prefix TEXT NOT NULL DEFAULT 'santoki_',
        created_at TIMESTAMP DEFAULT NOW()
      );
      INSERT INTO data_sources (name, connection_string) VALUES ('test_ds', 'pglite://memory');
    `)

    // 3. Associate
    const updated = await projectService.associateDataSource(project.id, 1)
    expect(updated.dataSourceId).toBe(1)
  })
})
