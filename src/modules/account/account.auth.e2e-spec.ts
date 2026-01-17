import { describe, it, expect, beforeEach } from 'vitest'
import { request, setupDbMock, clearDb, createAdminAndLogin } from '@/tests/test-utils.js'

setupDbMock()

import clientApp from '@/apps/app.js'
import adminApp from '@/apps/app.js'
import { db } from '@/db/index.js'

import { projectService } from '@/modules/project/project.service.js'
import { getTestConnectionString } from '@/tests/db-setup.js'

describe('User Auth (Client) E2E', () => {
    let projectId: number

    beforeEach(async () => {
        await clearDb(db)

        // Setup Project via Service directly (since Admin API is missing/refactored)
        // const adminCookie = await createAdminAndLogin(adminApp) // Login not needed for service calls if we bypass API

        const connectionString = getTestConnectionString()
        const project = await projectService.create('Client App')
        projectId = project.id
        await projectService.createDatabase(projectId, 'default', connectionString, '1_')
    })

    describe('POST /v1/auth/register', () => {
        it('should register a new user for the project', async () => {
            const res = await request(clientApp, '/v1/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    email: 'client@app.com',
                    password: 'password123',
                    name: 'Client User'
                }),
                headers: {
                    'Content-Type': 'application/json',
                    'x-project-id': String(projectId)
                }
            })

            expect(res.status).toBe(200)
            const body = await res.json()
            expect(body.email).toBe('client@app.com')
        })
    })

    describe('POST /v1/auth/sign-in', () => {
        it('should login a user', async () => {
            // Register first
            await request(clientApp, '/v1/auth/register', {
                method: 'POST',
                body: JSON.stringify({
                    email: 'login@app.com',
                    password: 'password123',
                    name: 'Login User'
                }),
                headers: {
                    'Content-Type': 'application/json',
                    'x-project-id': String(projectId)
                }
            })

            // Login
            const res = await request(clientApp, '/v1/auth/sign-in', {
                method: 'POST',
                body: JSON.stringify({
                    email: 'login@app.com',
                    password: 'password123'
                }),
                headers: {
                    'Content-Type': 'application/json',
                    'x-project-id': String(projectId)
                }
            })

            expect(res.status).toBe(200)
            const cookie = res.headers.get('set-cookie')
            expect(cookie).toBeTruthy()
        })
    })
})
