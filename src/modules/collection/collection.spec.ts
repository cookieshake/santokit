import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '@/db/schema.js'
import { collectionService } from '@/modules/collection/collection.service.js'
import { sql } from 'drizzle-orm'

// Mock the global db and the connection manager
vi.mock('../../db/index.js', async () => {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const schema = await import('../../db/schema.js')
  const pglite = new PGlite()
  const db = drizzle(pglite, { schema })
  return { db, pglite }
})

import * as dbModule from '@/db/index.js'
const { db, pglite } = dbModule as any
import { connectionManager } from '@/db/connection-manager.js'

// Mock connectionManager to return the SAME in-memory DB for all "physical" connections
vi.mock('@/db/connection-manager.js', () => ({
  connectionManager: {
    getConnection: vi.fn(),
    close: vi.fn()
  }
}))

const pgliteInstance = pglite as any

describe('Collection Service (Integration)', () => {
  beforeEach(async () => {
    // Setup schema
    await pgliteInstance.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT,
        email TEXT NOT NULL UNIQUE,
        password TEXT,
        role TEXT NOT NULL DEFAULT 'user',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS data_sources (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        connection_string TEXT NOT NULL,
        prefix TEXT NOT NULL DEFAULT 'santoki_',
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS projects (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        data_source_id INTEGER NOT NULL UNIQUE REFERENCES data_sources(id),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS collections (
        id SERIAL PRIMARY KEY,
        project_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        physical_name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `)
    await db.execute(sql`TRUNCATE TABLE collections, projects, data_sources, users RESTART IDENTITY CASCADE`)

    // Setup test data
    await pgliteInstance.exec(`INSERT INTO data_sources (name, connection_string, prefix) VALUES ('test_source', 'pg://test', 'test_')`)
    await pgliteInstance.exec(`INSERT INTO projects (name, data_source_id) VALUES ('test_project', 1)`)

    // Setup mock connection
    vi.mocked(connectionManager.getConnection).mockResolvedValue(db as any)
  })

  it('should create a collection and a physical table', async () => {
    const col = await collectionService.create(1, 'posts')
    expect(col).toBeDefined()
    expect(col.physicalName).toBe('test_p1_posts')

    // Verify physical table exists in pglite
    const tables = await pgliteInstance.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)
    const tableNames = tables.rows.map((r: any) => r.tablename)
    expect(tableNames).toContain('test_p1_posts')
  })

  it('should add a field to a collection', async () => {
    await collectionService.create(1, 'users')
    await collectionService.addField(1, 'users', 'age', 'integer', true)

    // Verify column exists
    const columns = await pgliteInstance.query(`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'test_p1_users' AND column_name = 'age'
        `)
    expect(columns.rows.length).toBe(1)
  })
})
