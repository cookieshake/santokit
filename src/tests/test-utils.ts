import { Hono } from 'hono'
import { vi } from 'vitest'
import { sql } from 'drizzle-orm'

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
export async function clearDb(db: any) {
    if (!db) return;
    // Drop logic to be clean and handle dynamic tables
    await db.execute(sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public; GRANT ALL ON SCHEMA public TO public;`)

    // Re-apply schema
    const { pushSchema } = await import('drizzle-kit/api');
    const schema = await import('@/db/schema.js'); // dynamic import
    const { apply } = await pushSchema(schema, db);
    await apply();
}

/**
 * Creates an admin user and logs them in, returning the session cookie.
 */
export async function createAdminAndLogin(app: Hono<any, any, any>) {
    const email = `admin-${Date.now()}@example.com`
    const password = 'password123'

    // Ensure System project exists because we need it for admin login/register
    const { projectService } = await import('@/modules/project/project.service.js')
    const { CONSTANTS } = await import('@/constants.js')

    try {
        await projectService.create(CONSTANTS.PROJECTS.SYSTEM_ID, 'postgres://system')
    } catch (e) {
        // Ignore if exists
    }

    await request(app, '/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        headers: { 'Content-Type': 'application/json' }
    })

    const res = await request(app, '/v1/auth/sign-in', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        headers: { 'Content-Type': 'application/json' }
    })

    return res.headers.get('set-cookie')
}
