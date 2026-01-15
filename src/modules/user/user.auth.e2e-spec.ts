import { describe, it, expect, beforeEach } from 'vitest'
import { request, setupDbMock, clearDb, createAdminAndLogin } from '@/tests/test-utils.js'

setupDbMock()

import clientApp from '@/apps/client.js'
import adminApp from '@/apps/admin.js'
import { db } from '@/db/index.js'

describe('User Auth (Client) E2E', () => {
    let projectId: number

    beforeEach(async () => {
        await clearDb(db)

        // Setup Project via Admin API first
        const adminCookie = await createAdminAndLogin(adminApp)

        const dsRes = await request(adminApp, '/admin/v1/sources', {
            method: 'POST',
            body: JSON.stringify({ name: 'ds1', connectionString: 'postgres://...', prefix: '1_' }),
            headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie || '' }
        })
        const ds = await dsRes.json()

        const projRes = await request(adminApp, '/admin/v1/projects', {
            method: 'POST',
            body: JSON.stringify({ name: 'Client App', dataSourceId: ds.id }),
            headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie || '' }
        })
        const project = await projRes.json()
        projectId = project.id
    })

    describe('POST /v1/auth/:projectId/register', () => {
        it('should register a new user for the project', async () => {
            const res = await request(clientApp, `/v1/auth/${projectId}/register`, {
                method: 'POST',
                body: JSON.stringify({
                    email: 'client@app.com',
                    password: 'password123',
                    name: 'Client User'
                }),
                headers: { 'Content-Type': 'application/json' }
            })

            expect(res.status).toBe(200)
            const body = await res.json()
            expect(body.email).toBe('client@app.com')
        })
    })

    describe('POST /v1/auth/:projectId/sign-in/email', () => {
        it('should login a user', async () => {
            // Register first
            await request(clientApp, `/v1/auth/${projectId}/register`, {
                method: 'POST',
                body: JSON.stringify({
                    email: 'login@app.com',
                    password: 'password123',
                    name: 'Login User'
                }),
                headers: { 'Content-Type': 'application/json' }
            })

            // Login
            const res = await request(clientApp, `/v1/auth/${projectId}/sign-in/email`, {
                method: 'POST',
                body: JSON.stringify({
                    email: 'login@app.com',
                    password: 'password123'
                }),
                headers: { 'Content-Type': 'application/json' }
            })

            expect(res.status).toBe(200)
            const cookie = res.headers.get('set-cookie')
            expect(cookie).toBeTruthy()
        })
    })
})
