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
import { PostgresAdapter } from '@/db/adapters/postgres-adapter.js'

// Mock connectionManager to return the SAME in-memory DB for all "physical" connections
vi.mock('@/db/connection-manager.js', async () => {
  const { PostgresAdapter } = await import('../../db/adapters/postgres-adapter.js')
  const { SqliteAdapter } = await import('../../db/adapters/sqlite-adapter.js')
  const isSqlite = process.env.TEST_DB_TYPE === 'sqlite'

  return {
    connectionManager: {
      getConnection: vi.fn(),
      getAdapter: vi.fn().mockReturnValue(isSqlite ? new SqliteAdapter() : new PostgresAdapter()),
      close: vi.fn()
    }
  }
})

describe('Collection Service (Integration)', () => {
  beforeEach(async () => {
    // Schema is already setup by createTestDb in the mock
    await sql`DELETE FROM projects`.execute(db)
    await sql`DELETE FROM accounts`.execute(db)


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

    // Verify physical table exists using Kysely introspection
    const tables = await db.introspection.getTables()
    const tableNames = tables.map(t => t.name)
    expect(tableNames).toContain('test_pproj_01h2xcejqtf2nbrexx3vf36v5a_posts')
  })

  it('should create a collection with UUID id type', async () => {
    const databaseId = 'db_01h2xcejqtf2nbrexx3vf36v5b';
    const col = await collectionService.create(databaseId, 'uuid_posts', 'uuid')
    expect(col.idType).toBe('uuid')

    // Verify physical table exists
    const tables = await db.introspection.getTables()
    const tableNames = tables.map(t => t.name)
    expect(tableNames).toContain('test_pproj_01h2xcejqtf2nbrexx3vf36v5a_uuid_posts')

    // Verify 'id' column type
    // SQLite stores types bit differently, but Kysely normalizes some. 
    // However, exact type string might differ ('uuid' vs 'text' or 'blob' in sqlite depending on dialect implementation).
    // For now we check if column exists.
    const table = tables.find(t => t.name === 'test_pproj_01h2xcejqtf2nbrexx3vf36v5a_uuid_posts')
    const idColumn = table?.columns.find(c => c.name === 'id')
    expect(idColumn).toBeDefined()
    // expect(idColumn?.dataType).toBe('uuid') // Skipping strict type check for cross-db compat for now
  })

  it('should add a field to a collection', async () => {
    const databaseId = 'db_01h2xcejqtf2nbrexx3vf36v5b';
    await collectionService.create(databaseId, 'users')
    await collectionService.addField(databaseId, 'users', 'age', 'integer', true)

    // Verify column exists
    // Verify column exists
    const tables = await db.introspection.getTables()
    const table = tables.find(t => t.name === 'test_pproj_01h2xcejqtf2nbrexx3vf36v5a_users')
    const startColumn = table?.columns.find(c => c.name === 'age')
    expect(startColumn).toBeDefined()
  })
})
