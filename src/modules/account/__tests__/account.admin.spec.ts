import { sql } from 'kysely'
import type { Pool } from 'pg'
import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'

import { accountService } from '@/modules/account/account.service.js'
import { databaseService } from '@/modules/database/database.service.js'
import { projectService } from '@/modules/project/project.service.js'
import { clearDb } from '@/tests/test-utils.js'

interface UserRecord {
  id: string
  email: string
  password: string
  roles: string[] | null
  name?: string | null
}

// Mock everything first
vi.mock('@/db/index.js', async () => {
  const { createTestDb } = await import('@/tests/db-setup.js')
  const { db, pool } = await createTestDb()
  return { db, pool }
})

vi.mock('@/db/connection-manager.js', async () => {
  const { createTestDb } = await import('@/tests/db-setup.js')
  const { db } = await createTestDb()
  const { PostgresAdapter } = await import('@/db/adapters/postgres-adapter.js')

  return {
    connectionManager: {
      getConnection: vi.fn().mockResolvedValue(db),
      getAdapter: vi.fn().mockReturnValue(new PostgresAdapter()),
    },
  }
})

const { db: mockedDb, pool } = (await import('@/db/index.js')) as any

describe('Account Module', () => {
  let testProjectId: string

  beforeEach(async () => {
    // Use robust cleanup
    await clearDb(mockedDb)

    // Create a test project with database
    const project = await projectService.create('test-project')
    testProjectId = project.id
    await databaseService.create(testProjectId, 'default', 'postgres://test-db-connection', 'test_')
  })

  afterAll(async () => {
    if (pool) {
      await pool.end()
    }
  })

  it('should register a new user in project', async () => {
    const user = (await accountService.createUser(
      testProjectId,
      {
        email: 'user@example.com',
        password: 'password123',
        roles: ['user'],
      },
      'users',
    )) as UserRecord
    expect(user.email).toBe('user@example.com')
    expect(user.roles).toContain('user')
  })

  it('should NOT allow registering duplicate email', async () => {
    await accountService.createUser(
      testProjectId,
      {
        email: 'user@example.com',
        password: 'password123',
        roles: ['user'],
      },
      'users',
    )
    await expect(
      accountService.createUser(
        testProjectId,
        {
          email: 'user@example.com',
          password: 'passother',
          roles: ['user'],
        },
        'users',
      ),
    ).rejects.toThrow()
  })
})
