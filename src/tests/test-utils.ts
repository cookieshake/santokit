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
}

/**
 * Cleans up the database tables (truncates all data).
 * Useful to run in beforeEach.
 */
export async function clearDb(db: any) {
    if (!db) return;
    // Get all table names would be ideal, but for now hardcode or truncate specifics
    // A better approach is usually to just truncate known tables or restart the pglite instance
    // Since we are using pglite, we might just want to create a new one, but that might be slow.
    // Let's try truncating user related tables for now.

    // Ordered to avoid foreign key constraints if cascading isn't reliable, 
    // but CASCADE usually handles it.
    await db.execute(sql`TRUNCATE TABLE users, projects, collections, data_sources RESTART IDENTITY CASCADE`)
}

/**
 * Creates an admin user and logs them in, returning the session cookie.
 */
export async function createAdminAndLogin(app: Hono<any, any, any>) {
    const email = `admin-${Date.now()}@example.com`
    const password = 'password123'

    await request(app, '/admin/v1/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        headers: { 'Content-Type': 'application/json' }
    })

    const res = await request(app, '/admin/v1/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
        headers: { 'Content-Type': 'application/json' }
    })

    return res.headers.get('set-cookie')
}
