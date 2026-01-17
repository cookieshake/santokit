import { Hono } from 'hono'
import { vi } from 'vitest'
import { sql, Kysely } from 'kysely'

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
        return {
            connectionManager: {
                getConnection: vi.fn().mockResolvedValue(db)
            }
        }
    })
}

/**
 * Cleans up the database tables (drops schema and re-applies).
 * Useful to run in beforeEach.
 */
export async function clearDb(db: Kysely<any>) {
    if (!db) return;
    // Drop logic to be clean and handle dynamic tables
    await sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;`.execute(db)

    // Re-apply schema
    const { applySchema } = await import('./db-setup.js')
    await applySchema(db)
}

/**
 * Creates a project with a database, then creates an admin user and logs them in.
 * Returns the session cookie and the project ID.
 */
export async function createAdminAndLogin(app: Hono<any, any, any>) {
    const email = `admin-${Date.now()}@example.com`
    const password = 'password123'

    const { projectService } = await import('@/modules/project/project.service.js')

    // Create a test project
    const project = await projectService.create('test-project')
    const projectId = project.id

    // Create a default database for the project
    await projectService.createDatabase(projectId, 'default', 'postgres://localhost:5432/test', 'test_')

    // Register user in the project
    const { CONSTANTS } = await import('@/constants.js')
    await request(app, '/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password, roles: ['admin'] }),
        headers: {
            'Content-Type': 'application/json',
            [CONSTANTS.HEADERS.PROJECT_ID]: String(projectId)
        }
    })

    const res = await request(app, '/v1/auth/sign-in', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        headers: {
            'Content-Type': 'application/json',
            [CONSTANTS.HEADERS.PROJECT_ID]: String(projectId)
        }
    })

    return res.headers.get('set-cookie')
}
