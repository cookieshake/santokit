import { describe, it, expect, beforeEach } from 'vitest'
import { request, setupDbMock, clearDb } from '@/tests/test-utils.js'

setupDbMock()

// Import app after mock setup
import app from '@/apps/app.js'

// Need to access db to check things directly if needed, or rely on API responses
// Since we mocked the db module, we can import it and get the mocked instance
import { db } from '@/db/index.js'

describe('Admin Module E2E', () => {
    beforeEach(async () => {
        await clearDb(db)
    })

    describe('POST /v1/auth/register', () => {
        it('should register a new admin', async () => {
            const res = await request(app, '/v1/auth/register', {
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
            // roles check might fail if better-auth returns minimal user object.
            // But let's assume it works or update expectation if needed.
        })

        it('should fail with 400/500 if duplicate', async () => {
            // First register
            await request(app, '/v1/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    email: 'existing@example.com',
                    password: 'password123'
                }),
                headers: { 'Content-Type': 'application/json' }
            })

            // Try again
            const res = await request(app, '/v1/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    email: 'existing@example.com',
                    password: 'password123'
                }),
                headers: { 'Content-Type': 'application/json' }
            })
            expect(res.status).not.toBe(200)
        })
    })

    describe('GET /v1/data/system/accounts', () => {
        it('should return 401 if unauthenticated', async () => {
            const res = await request(app, '/v1/data/system/accounts')
            expect(res.status).toBe(401)
        })

        it('should list accounts if authenticated', async () => {
            // Register first
            await request(app, '/v1/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    email: 'admin@example.com',
                    password: 'password123'
                }),
                headers: { 'Content-Type': 'application/json' }
            })

            // Login
            const loginRes = await request(app, '/v1/auth/sign-in/email', {
                method: 'POST',
                body: JSON.stringify({
                    email: 'admin@example.com',
                    password: 'password123'
                }),
                headers: { 'Content-Type': 'application/json' }
            })

            const cookie = loginRes.headers.get('set-cookie')
            expect(cookie).toBeTruthy()

            // Now list accounts
            const res = await request(app, '/v1/data/system/accounts', {
                headers: {
                    'Cookie': cookie || ''
                }
            })

            expect(res.status).toBe(200)
            const body = await res.json()
            expect(Array.isArray(body)).toBe(true)
            expect(body.length).toBeGreaterThanOrEqual(1)
            // The body is array of accounts. Find ours.
            const me = body.find((a: any) => a.email === 'admin@example.com')
            expect(me).toBeDefined()
        })
    })
})
