import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { collectionService } from '@/modules/collection/collection.service.js'
import { sql, Kysely, PostgresDialect } from 'kysely'
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
    await sql`TRUNCATE TABLE projects, accounts RESTART IDENTITY CASCADE`.execute(db)


    // Setup test data
    // Use TypeIDs for IDs
    const projectId = 'proj_01h2xcejqtf2nbrexx3vf36v5a';
    const databaseId = 'db_01h2xcejqtf2nbrexx3vf36v5b';
    await sql`INSERT INTO projects (id, name) VALUES (${projectId}, 'test_project')`.execute(db)
    await sql`INSERT INTO databases (id, project_id, name, connection_string, prefix) VALUES (${databaseId}, ${projectId}, 'default', 'pg://test', 'test_')`.execute(db)

    // Setup mock connection
    vi.mocked(connectionManager.getConnection).mockResolvedValue(db as any)
  })

  afterAll(async () => {
    if (pool) {
      await pool.end()
    }
  })

  it('should create a collection and a physical table', async () => {
    const databaseId = 'db_01h2xcejqtf2nbrexx3vf36v5b';
    const col = await collectionService.create(databaseId, 'posts')
    expect(col).toBeDefined()
    expect(col.physicalName).toBe('test_pproj_01h2xcejqtf2nbrexx3vf36v5a_posts') // Verify generated name logic

    // Verify physical table exists using information_schema
    const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`.execute(db)
    const tableNames = tables.rows.map((r: any) => r.tablename)
    expect(tableNames).toContain('test_pproj_01h2xcejqtf2nbrexx3vf36v5a_posts')
  })

  it('should create a collection with UUID id type', async () => {
    const databaseId = 'db_01h2xcejqtf2nbrexx3vf36v5b';
    const col = await collectionService.create(databaseId, 'uuid_posts', 'uuid')
    expect(col.idType).toBe('uuid')

    // Verify physical table exists
    const tables = await sql`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`.execute(db)
    const tableNames = tables.rows.map((r: any) => r.tablename)
    expect(tableNames).toContain('test_pproj_01h2xcejqtf2nbrexx3vf36v5a_uuid_posts')

    // Verify 'id' column type is uuid
    const columns = await sql`
      SELECT data_type FROM information_schema.columns 
      WHERE table_name = 'test_pproj_01h2xcejqtf2nbrexx3vf36v5a_uuid_posts' AND column_name = 'id'
    `.execute(db)
    expect((columns.rows[0] as any).data_type).toBe('uuid')
  })

  it('should add a field to a collection', async () => {
    const databaseId = 'db_01h2xcejqtf2nbrexx3vf36v5b';
    await collectionService.create(databaseId, 'users')
    await collectionService.addField(databaseId, 'users', 'age', 'integer', true)

    // Verify column exists
    const columns = await sql`
            SELECT column_name FROM information_schema.columns 
            WHERE table_name = 'test_pproj_01h2xcejqtf2nbrexx3vf36v5a_users' AND column_name = 'age'
        `.execute(db)
    expect(columns.rows.length).toBe(1)
  })
})
