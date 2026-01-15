import { describe, it, expect, beforeEach } from 'vitest'
import { request, setupDbMock, clearDb, createAdminAndLogin } from '@/tests/test-utils.js'

setupDbMock()

import clientApp from '@/apps/client.js'
import adminApp from '@/apps/admin.js'
import { db } from '@/db/index.js'

describe('Data Module (Client) E2E', () => {
    let projectId: number
    const collectionName = 'articles'

    beforeEach(async () => {
        await clearDb(db)

        // Setup Project and Collection via Admin API
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

        // Create Collection
        await request(adminApp, `/admin/v1/projects/${projectId}/collections`, {
            method: 'POST',
            body: JSON.stringify({ name: collectionName, idType: 'serial' }),
            headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie || '' }
        })

        // Add Fields
        await request(adminApp, `/admin/v1/projects/${projectId}/collections/${collectionName}/fields`, {
            method: 'POST',
            body: JSON.stringify({ name: 'title', type: 'text', isNullable: false }),
            headers: { 'Content-Type': 'application/json', 'Cookie': adminCookie || '' }
        })
    })

    describe('POST /v1/data/:projectId/:collectionName', () => {
        it('should insert data into collection', async () => {
            // Need to be authenticated as a user of the project?
            // client.ts says: app.use('/data/:projectId/*', authzMiddleware...)
            // and getAuthProject(db)

            // Register a client user and login
            await request(clientApp, `/v1/auth/${projectId}/register`, {
                method: 'POST',
                body: JSON.stringify({ email: 'writer@app.com', password: 'pw', name: 'Writer' }),
                headers: { 'Content-Type': 'application/json' }
            })

            const loginRes = await request(clientApp, `/v1/auth/${projectId}/sign-in/email`, {
                method: 'POST',
                body: JSON.stringify({ email: 'writer@app.com', password: 'pw' }),
                headers: { 'Content-Type': 'application/json' }
            })
            const cookie = loginRes.headers.get('set-cookie')

            const res = await request(clientApp, `/v1/data/${projectId}/${collectionName}`, {
                method: 'POST',
                body: JSON.stringify({ title: 'Hello World' }),
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookie || ''
                }
            })

            expect(res.status).toBe(200)
            const body = await res.json()
            expect(body.title).toBe('Hello World')
            expect(body.id).toBeDefined()
        })
    })

    describe('GET /v1/data/:projectId/:collectionName', () => {
        it('should list data', async () => {
            // Auth
            await request(clientApp, `/v1/auth/${projectId}/register`, {
                method: 'POST',
                body: JSON.stringify({ email: 'reader@app.com', password: 'pw', name: 'Reader' }),
                headers: { 'Content-Type': 'application/json' }
            })
            const loginRes = await request(clientApp, `/v1/auth/${projectId}/sign-in/email`, {
                method: 'POST',
                body: JSON.stringify({ email: 'reader@app.com', password: 'pw' }),
                headers: { 'Content-Type': 'application/json' }
            })
            const cookie = loginRes.headers.get('set-cookie')

            // Insert data
            await request(clientApp, `/v1/data/${projectId}/${collectionName}`, {
                method: 'POST',
                body: JSON.stringify({ title: 'Post 1' }),
                headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
            })

            // List
            const res = await request(clientApp, `/v1/data/${projectId}/${collectionName}`, {
                headers: { 'Cookie': cookie || '' }
            })

            expect(res.status).toBe(200)
            const body = await res.json()
            expect(Array.isArray(body)).toBe(true)
            expect(body.length).toBeGreaterThanOrEqual(1)
            expect(body[0].title).toBe('Post 1')
        })
    })
})
