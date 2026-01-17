import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import * as schema from '@/db/schema.js'
import { collectionService } from '@/modules/collection/collection.service.js'
import { sql } from 'drizzle-orm'
import type { Pool } from 'pg'

// testPool removed

// Mock the global db and the connection manager
vi.mock('../../db/index.js', async () => {
  const { createTestDb } = await import('../../tests/db-setup.js')
  const { db, pool } = await createTestDb()
  return { db, pool }
})

import * as dbModule from '@/db/index.js'
const { db, pool } = dbModule as any
import { connectionManager } from '@/db/connection-manager.js'

// Mock connectionManager to return the SAME in-memory DB for all "physical" connections
vi.mock('@/db/connection-manager.js', () => ({
  connectionManager: {
    getConnection: vi.fn(),
    close: vi.fn()
  }
}))

describe('Collection Service (Integration)', () => {
  beforeEach(async () => {
    // Schema is already setup by createTestDb in the mock
    await db.execute(sql`TRUNCATE TABLE projects, accounts RESTART IDENTITY CASCADE`)


    // Setup test data
    await db.execute(sql`INSERT INTO projects (id, name) VALUES (1, 'test_project')`)
    await db.execute(sql`INSERT INTO databases (id, project_id, name, connection_string, prefix) VALUES (1, 1, 'default', 'pg://test', 'test_')`)

    // Setup mock connection
    vi.mocked(connectionManager.getConnection).mockResolvedValue(db as any)
  })

  afterAll(async () => {
    if (pool) {
      await pool.end()
    }
  })

  it('should create a collection and a physical table', async () => {
    const col = await collectionService.create(1, 'posts')
    expect(col).toBeDefined()
    expect(col.physicalName).toBe('test_p1_posts')

    // Verify physical table exists using information_schema
    const tables = await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)
    const tableNames = tables.rows.map((r: any) => r.tablename)
    expect(tableNames).toContain('test_p1_posts')
  })

  it('should create a collection with UUID id type', async () => {
    const col = await collectionService.create(1, 'uuid_posts', 'uuid')
    expect(col.idType).toBe('uuid')

    // Verify physical table exists
    const tables = await db.execute(sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)
    const tableNames = tables.rows.map((r: any) => r.tablename)
    expect(tableNames).toContain('test_p1_uuid_posts')

    // Verify 'id' column type is uuid
    const columns = await db.execute(sql`
      SELECT data_type FROM information_schema.columns 
      WHERE table_name = 'test_p1_uuid_posts' AND column_name = 'id'
    `)
    expect(columns.rows[0].data_type).toBe('uuid')
  })

  it('should add a field to a collection', async () => {
    await collectionService.create(1, 'users')
    await collectionService.addField(1, 'users', 'age', 'integer', true)

    // Verify column exists
    const columns = await db.execute(sql`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'test_p1_users' AND column_name = 'age'
        `)
    expect(columns.rows.length).toBe(1)
  })
})
