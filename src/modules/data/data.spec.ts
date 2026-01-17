import { describe, it, expect, beforeEach } from 'vitest'
import { request, setupDbMock, clearDb, createAdminAndLogin } from '@/tests/test-utils.js'

setupDbMock()

import clientApp from '@/apps/app.js'
import adminApp from '@/apps/app.js'
import { db } from '@/db/index.js'

import { projectService } from '@/modules/project/project.service.js'
import { sql } from 'kysely'
import { connectionManager } from '@/db/connection-manager.js'
import { getTestConnectionString } from '@/tests/db-setup.js'
import { projectRepository } from '@/modules/project/project.repository.js'
import { policyService } from '@/modules/policy/policy.service.js'
import { collectionService } from '@/modules/collection/collection.service.js'

describe('Data Module (Client) E2E', () => {
    let projectId: number
    const collectionName = 'articles'

    beforeEach(async () => {
        await clearDb(db)

        const connectionString = getTestConnectionString()
        const project = await projectService.create('Client App')
        projectId = project.id

        const database = await projectService.createDatabase(projectId, 'default', connectionString, '1_')

        // Create Collection via Service (creates metadata + physical table)
        await collectionService.create(database.id, collectionName)
        await collectionService.addField(database.id, collectionName, 'title', 'text', false)

        // Add Policies
        await policyService.create({
            project_id: projectId,
            database_id: database.id,
            collection_name: collectionName,
            role: 'user',
            action: 'create',
            condition: '{}'
        })
        await policyService.create({
            project_id: projectId,
            database_id: database.id,
            collection_name: collectionName,
            role: 'user',
            action: 'read',
            condition: '{}'
        })
    })

    describe('POST /v1/databases/default/collections/:collectionName/records', () => {
        it('should insert data into collection', async () => {
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

            // Updated URL structure with Header
            const url = `/v1/databases/default/collections/${collectionName}/records`
            const res = await request(clientApp, url, {
                method: 'POST',
                body: JSON.stringify({ title: 'Hello World' }),
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookie || '',
                    'x-project-id': String(projectId)
                }
            })

            if (res.status !== 200) {
                console.error('POST Error Body:', await res.text())
            }
            expect(res.status).toBe(200)
            const body = await res.json()
            expect(body.id).toBeDefined()
        })
    })

    describe('GET /v1/databases/default/collections/:collectionName/records', () => {
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
            const url = `/v1/databases/default/collections/${collectionName}/records`
            await request(clientApp, url, {
                method: 'POST',
                body: JSON.stringify({ title: 'Post 1' }),
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookie || '',
                    'x-project-id': String(projectId)
                }
            })

            // List
            const res = await request(clientApp, url, {
                headers: {
                    'Cookie': cookie || '',
                    'x-project-id': String(projectId)
                }
            })

            if (res.status !== 200) {
                console.error('GET Error Body:', await res.text())
            }
            expect(res.status).toBe(200)
            const body = await res.json()
            expect(Array.isArray(body)).toBe(true)
            expect(body.length).toBeGreaterThanOrEqual(1)
            expect(body[0].title).toBe('Post 1')
        })
    })
})
