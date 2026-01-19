import { describe, it, expect, beforeEach } from 'vitest'
import { request, setupDbMock, clearDb } from '@/tests/test-utils.js'

setupDbMock()

import app from '@/apps/app.js'
import { db } from '@/db/index.js'
import { CONSTANTS } from '@/constants.js'

describe('Multiple Auth Collections E2E', () => {
    let projectId: string

    beforeEach(async () => {
        await clearDb(db)

        // 1. Create Project Direct in DB (Bypassing RBAC)
        const { typeid } = await import('typeid-js')
        projectId = typeid('proj').toString()
        await db.insertInto('projects').values({
            id: projectId,
            name: 'MultiAuthProject'
        }).execute()

        // 2. Create Database
        const { databaseService } = await import('@/modules/database/database.service.js')
        const database = await databaseService.create(projectId, 'default', 'postgres://localhost:5432/test', 'test_ma_')

        // 3. Create a second auth collection 'admins'
        const { collectionService } = await import('@/modules/collection/collection.service.js')
        await collectionService.create(database.id, 'admins', 'typeid', 'auth')
    })

    it('should register and login to explicit "users" collection', async () => {
        const email = 'default@example.com'
        const password = 'password123'
        const collectionName = 'users'

        // Register
        const regRes = await request(app, '/v1/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, collectionName }),
            headers: {
                'Content-Type': 'application/json',
                [CONSTANTS.HEADERS.PROJECT_ID]: projectId
            }
        })
        expect(regRes.status).toBe(200)

        // Login
        const loginRes = await request(app, '/v1/auth/sign-in', {
            method: 'POST',
            body: JSON.stringify({ email, password, collectionName }),
            headers: {
                'Content-Type': 'application/json',
                [CONSTANTS.HEADERS.PROJECT_ID]: projectId
            }
        })
        expect(loginRes.status).toBe(200)
        const body = await loginRes.json()
        expect(body.user.email).toBe(email)
    })

    it('should register and login to explicit "admins" collection', async () => {
        const email = 'admin@example.com'
        const password = 'password123'
        const collectionName = 'admins'

        // Register
        const regRes = await request(app, '/v1/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, collectionName }),
            headers: {
                'Content-Type': 'application/json',
                [CONSTANTS.HEADERS.PROJECT_ID]: projectId
            }
        })
        expect(regRes.status).toBe(200)

        // Login
        const loginRes = await request(app, '/v1/auth/sign-in', {
            method: 'POST',
            body: JSON.stringify({ email, password, collectionName }),
            headers: {
                'Content-Type': 'application/json',
                [CONSTANTS.HEADERS.PROJECT_ID]: projectId
            }
        })
        expect(loginRes.status).toBe(200)
        const body = await loginRes.json()
        expect(body.user.email).toBe(email)
        // Verify /me endpoint returns collectionName
        const meRes = await request(app, '/v1/auth/me', {
            headers: {
                'Cookie': loginRes.headers.get('set-cookie') || ''
            }
        })
        const meBody = await meRes.json()
        expect(meBody.user.collectionName).toBe('admins')
        expect(meBody.user.collectionId).toBeDefined()
        expect(typeof meBody.user.collectionId).toBe('string')
    })

    it('should fail to login if collectionName is incorrect', async () => {
        const email = 'admin@example.com'
        const password = 'password123'
        const collectionName = 'admins'

        // Register in 'admins'
        await request(app, '/v1/auth/register', {
            method: 'POST',
            body: JSON.stringify({ email, password, collectionName }),
            headers: {
                'Content-Type': 'application/json',
                [CONSTANTS.HEADERS.PROJECT_ID]: projectId
            }
        })

        // Try login to 'users' (default)
        const loginRes = await request(app, '/v1/auth/sign-in', {
            method: 'POST',
            body: JSON.stringify({ email, password, collectionName: 'users' }), // Explicitly wrong collection
            headers: {
                'Content-Type': 'application/json',
                [CONSTANTS.HEADERS.PROJECT_ID]: projectId
            }
        })
        expect(loginRes.status).toBe(401) // Or 401 depending on where it fails (User not found throws error which might be 400 or 401 handled by app error handler)
    })
})
