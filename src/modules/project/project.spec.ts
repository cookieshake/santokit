import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '@/db/schema.js'
import { projectService } from './project.service.js'
import { projectRepository } from './project.repository.js'
import { sql } from 'drizzle-orm'

vi.mock('../../db/index.js', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const schema = await import('../../db/schema.js')
  const pglite = new PGlite()
  const db = drizzle(pglite, { schema })
  return { db, pglite }
})

// Correctly import the mocked db
import * as dbModule from '../../db/index.js'
const { db, pglite } = dbModule as any
const pgliteInstance = pglite as any


describe('Project Service (Integration)', () => {
  beforeEach(async () => {
    // Basic table creation for tests (since we don't have migrations)
    await pgliteInstance.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        owner_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `)

    // Clear tables
    await db.execute(sql`TRUNCATE TABLE projects, users RESTART IDENTITY CASCADE`)

    // Create a dummy user
    await pgliteInstance.exec(`INSERT INTO users (email, password) VALUES ('test@example.com', 'pass123')`)
  })


  it('should create a new project', async () => {
    const project = await projectService.create('New Project', 1)
    expect(project).toBeDefined()
    expect(project.name).toBe('New Project')
    expect(project.ownerId).toBe(1)
  })

  it('should list projects', async () => {
    await projectService.create('Project 1', 1)
    await projectService.create('Project 2', 1)

    const projects = await projectService.list()
    expect(projects.length).toBe(2)
    expect(projects[0].name).toBe('Project 1')
  })
})
