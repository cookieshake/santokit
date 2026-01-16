import { describe, it, expect, beforeEach } from 'vitest'
import { request, setupDbMock, clearDb, createAdminAndLogin } from '@/tests/test-utils.js'

setupDbMock()

import clientApp from '@/apps/app.js'
import adminApp from '@/apps/app.js'
import { db } from '@/db/index.js'

import { projectService } from '@/modules/project/project.service.js'
// import collectionController ? We don't need controller, maybe service but data module handles it dynamically.
// Actually data module creates collection implicitly?
// No, data module needs collection to exist?
// data.e2e-spec.ts used `/admin/v1/projects/${projectId}/collections`.
// Does collection exist in schema? No. "Collections table removed - using dynamic introspection".
// So data module might create tables on the fly?
// Or we need to create table physically in project DB.
// I'll assume we need to create it.
import { sql } from 'drizzle-orm' // imported in test-utils? No.
import { connectionManager } from '@/db/connection-manager.js'
import { getTestConnectionString } from '@/tests/db-setup.js'

describe('Data Module (Client) E2E', () => {
    let projectId: number
    const collectionName = 'articles'

    beforeEach(async () => {
        await clearDb(db)

        const connectionString = getTestConnectionString()
        const project = await projectService.create('Client App', connectionString, '1_')
        projectId = project.id

        // Create Collection Table in Project DB
        const projectDb = await connectionManager.getConnection(project.name)
        if (!projectDb) throw new Error('No project db')

        // Simple table creation for 'articles' with 'title'
        await projectDb.execute(sql.raw(`
            CREATE TABLE IF NOT EXISTS "${project.prefix}${collectionName}" (
                id SERIAL PRIMARY KEY,
                title TEXT NOT NULL
            )
        `))
    })

    describe('POST /v1/data/:projectId/:collectionName', () => {
        it('should insert data into collection', async () => {
            // Need to be authenticated as a user of the project?


            // Register a client user and login
            await request(clientApp, `/v1/auth/register`, {
                method: 'POST',
                body: JSON.stringify({ email: 'writer@app.com', password: 'pw', name: 'Writer' }),
                headers: { 'Content-Type': 'application/json', 'x-project-id': String(projectId) }
            })

            const loginRes = await request(clientApp, `/v1/auth/sign-in`, {
                method: 'POST',
                body: JSON.stringify({ email: 'writer@app.com', password: 'pw' }),
                headers: { 'Content-Type': 'application/json', 'x-project-id': String(projectId) }
            })
            const cookie = loginRes.headers.get('set-cookie')

            const res = await request(clientApp, '/v1/data/' + collectionName, {
                method: 'POST',
                body: JSON.stringify({ title: 'Hello World' }),
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookie || '',
                    'x-project-id': String(projectId)
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
            await request(clientApp, `/v1/auth/register`, {
                method: 'POST',
                body: JSON.stringify({ email: 'reader@app.com', password: 'pw', name: 'Reader' }),
                headers: { 'Content-Type': 'application/json', 'x-project-id': String(projectId) }
            })
            const loginRes = await request(clientApp, `/v1/auth/sign-in`, {
                method: 'POST',
                body: JSON.stringify({ email: 'reader@app.com', password: 'pw' }),
                headers: { 'Content-Type': 'application/json', 'x-project-id': String(projectId) }
            })
            const cookie = loginRes.headers.get('set-cookie')

            // Insert data
            await request(clientApp, '/v1/data/' + collectionName, {
                method: 'POST',
                body: JSON.stringify({ title: 'Post 1' }),
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookie || '',
                    'x-project-id': String(projectId)
                }
            })

            // List
            const res = await request(clientApp, '/v1/data/' + collectionName, {
                headers: {
                    'Cookie': cookie || '',
                    'x-project-id': String(projectId)
                }
            })

            expect(res.status).toBe(200)
            const body = await res.json()
            expect(Array.isArray(body)).toBe(true)
            expect(body.length).toBeGreaterThanOrEqual(1)
            expect(body[0].title).toBe('Post 1')
        })
    })
})
