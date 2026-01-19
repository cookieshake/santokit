import { Hono } from 'hono'
import { sql, Kysely } from 'kysely'
import { vi } from 'vitest'

// Re-export db setup for convenience
export * from './db-setup.js'

/**
 * Helper to create a request to the Hono app.
 * This wraps the app.request method.
 */
export async function request(app: Hono<any, any, any>, path: string, options: RequestInit = {}) {
  return app.request(path, options)
}

/**
 * Helper to setup the database mock.
 * Call this at the top of your spec file before importing the app.
 */
export function setupDbMock() {
  vi.mock('@/db/index.js', async () => {
    const { createTestDb } = await import('./db-setup.js')
    return await createTestDb()
  })

  vi.mock('@/db/connection-manager.js', async () => {
    const { createTestDb } = await import('./db-setup.js')
    const { db } = await createTestDb()
    const { PostgresAdapter } = await import('../db/adapters/postgres-adapter.js')

    return {
      connectionManager: {
        getConnection: vi.fn().mockResolvedValue(db),
        getAdapter: vi.fn().mockReturnValue(new PostgresAdapter()),
      },
    }
  })
}

/**
 * Cleans up the database tables (drops schema and re-applies).
 * Useful to run in beforeEach.
 */
/**
 * Cleans up the database tables (deletes all rows).
 * Useful to run in beforeEach.
 */
export async function clearDb(db: Kysely<any>) {
  if (!db) return

  // Delete from all tables in correct order (child tables first)
  await sql`DELETE FROM policies`.execute(db)
  await sql`DELETE FROM collections`.execute(db)
  await sql`DELETE FROM databases`.execute(db)
  await sql`DELETE FROM accounts`.execute(db)
  await sql`DELETE FROM projects`.execute(db)
}

/**
 * Creates a project with a database, then creates an admin user and logs them in.
 * Returns the session cookie and the project ID.
 */
export async function createAdminAndLogin(app: Hono<any, any, any>) {
  const email = `admin-${Date.now()}@example.com`
  const password = 'password123'

  const { projectService } = await import('@/modules/project/project.service.js')
  const { databaseService } = await import('@/modules/database/database.service.js')

  // Create a test project
  const project = await projectService.create('test-project')
  const projectId = project.id

  // Create a default database for the project
  await databaseService.create(projectId, 'default', 'postgres://localhost:5432/test', 'test_')

  // Register user in the project
  const { CONSTANTS } = await import('@/constants.js')
  await request(app, '/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, role: 'admin', collectionName: 'users' }),
    headers: {
      'Content-Type': 'application/json',
      [CONSTANTS.HEADERS.PROJECT_ID]: String(projectId),
    },
  })

  const res = await request(app, '/v1/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify({ email, password, collectionName: 'users' }),
    headers: {
      'Content-Type': 'application/json',
      [CONSTANTS.HEADERS.PROJECT_ID]: String(projectId),
    },
  })

  return res.headers.get('set-cookie')
}

/**
 * Creates a project with a database, then creates a regular user and logs them in.
 * Returns the session cookie and the project ID.
 */
export async function createRegularUserAndLogin(app: Hono<any, any, any>) {
  const email = `user-${Date.now()}@example.com`
  const password = 'password123'

  const { projectService } = await import('@/modules/project/project.service.js')
  const { databaseService } = await import('@/modules/database/database.service.js')

  // Create a test project
  const project = await projectService.create('test-project-user')
  const projectId = project.id

  // Create a default database for the project
  await databaseService.create(projectId, 'default', 'postgres://localhost:5432/test', 'test_user_')

  // Register user in the project
  const { CONSTANTS } = await import('@/constants.js')
  await request(app, '/v1/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password, role: 'user', collectionName: 'users' }),
    headers: {
      'Content-Type': 'application/json',
      [CONSTANTS.HEADERS.PROJECT_ID]: String(projectId),
    },
  })

  const res = await request(app, '/v1/auth/sign-in', {
    method: 'POST',
    body: JSON.stringify({ email, password, collectionName: 'users' }),
    headers: {
      'Content-Type': 'application/json',
      [CONSTANTS.HEADERS.PROJECT_ID]: String(projectId),
    },
  })

  return res.headers.get('set-cookie')
}
