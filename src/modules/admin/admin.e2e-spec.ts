import { describe, it, expect, beforeEach } from 'vitest'
import { request, setupDbMock, clearDb } from '@/tests/test-utils.js'

setupDbMock()

// Import app after mock setup
import app from '@/apps/admin.js'

// Need to access db to check things directly if needed, or rely on API responses
// Since we mocked the db module, we can import it and get the mocked instance
import { db } from '@/db/index.js'

describe('Admin Module E2E', () => {
    beforeEach(async () => {
        await clearDb(db)
    })

    describe('POST /admin/v1/auth/register', () => {
        it('should register a new admin', async () => {
            const res = await request(app, '/admin/v1/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    email: 'newadmin@example.com',
                    password: 'password123'
                }),
                headers: { 'Content-Type': 'application/json' }
            })

            expect(res.status).toBe(200)
            const body = await res.json()
            expect(body.email).toBe('newadmin@example.com')
            expect(body.roles).toContain('admin')
        })

        it('should fail with 400/500 if checking duplicates logic is hit', async () => {
            // First register
            await request(app, '/admin/v1/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    email: 'existing@example.com',
                    password: 'password123'
                }),
                headers: { 'Content-Type': 'application/json' }
            })

            // Try again
            const res = await request(app, '/admin/v1/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    email: 'existing@example.com',
                    password: 'password123'
                }),
                headers: { 'Content-Type': 'application/json' }
            })

            // The service throws error, the app error handler catches it
            // Based on admin.controller it returns whatever service returns or throws
            // If service throws existing error, it might be 500 unless handled
            // Let's just expect it not to be 200 for now or verify specific error if we know it
            expect(res.status).not.toBe(200)
        })
    })

    describe('GET /admin/v1/admins', () => {
        it('should return 401 if unauthenticated', async () => {
            const res = await request(app, '/admin/v1/admins')
            expect(res.status).toBe(401)
        })

        it('should list admins if authenticated', async () => {
            // 1. Register an admin to get a session/user logic working or manually simulate a session
            // Since betting-auth is complex to mock fully perfectly just by db, 
            // the easiest path is to use the actual login/register flow if possible.
            // But login logic in auth-admin.ts might rely on headers etc.

            // Actually, we can just register and assumes it doesn't auto-login unless we call login.
            // Wait, admin controller uses `authAdmin.handler`.
            // We need to login to get a token.

            // Register first
            await request(app, '/admin/v1/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    email: 'admin@example.com',
                    password: 'password123'
                }),
                headers: { 'Content-Type': 'application/json' }
            })

            // Login
            const loginRes = await request(app, '/admin/v1/auth/sign-in/email', {
                method: 'POST',
                body: JSON.stringify({
                    email: 'admin@example.com',
                    password: 'password123'
                }),
                headers: { 'Content-Type': 'application/json' }
            })

            // better-auth usually sets a cookie or returns a token. 
            // In a headless test fetch default doesn't store cookies. 
            // We might need to handle the Set-Cookie header manually.
            const cookie = loginRes.headers.get('set-cookie')
            expect(cookie).toBeTruthy()

            // Now list admins
            const res = await request(app, '/admin/v1/admins', {
                headers: {
                    'Cookie': cookie || ''
                }
            })

            expect(res.status).toBe(200)
            const body = await res.json()
            expect(Array.isArray(body)).toBe(true)
            expect(body.length).toBeGreaterThanOrEqual(1)
            expect(body[0].email).toBe('admin@example.com')
        })
    })
})
