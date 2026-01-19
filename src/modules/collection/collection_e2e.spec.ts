import { describe, it, expect, beforeEach } from 'vitest'
import { request, setupDbMock, clearDb, createAdminAndLogin } from '@/tests/test-utils.js'

setupDbMock()

import app from '@/apps/app.js'
import { db } from '@/db/index.js'

describe('Collection Module E2E', () => {
    let cookie: string | null
    let projectId: string

    beforeEach(async () => {
        await clearDb(db)
        cookie = await createAdminAndLogin(app)

        // Setup Project
        const projRes = await request(app, '/v1/projects', {
            method: 'POST',
            body: JSON.stringify({ name: 'P1' }),
            headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
        })
        const text = await projRes.text()
        console.log('Project Create Response:', projRes.status, text)
        const project = JSON.parse(text)
        projectId = project.id

        // Create Default Database
        await request(app, `/v1/projects/${projectId}/databases`, {
            method: 'POST',
            body: JSON.stringify({ name: 'default', connectionString: 'memory://p1', prefix: 'p1_' }),
            headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
        })
    })

    describe('POST /v1/databases/:databaseName/collections', () => {
        it('should create a collection and return its type in detail', async () => {
            const res = await request(app, '/v1/databases/default/collections', {
                method: 'POST',
                body: JSON.stringify({ name: 'items', idType: 'serial' }),
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookie || '',
                    'x-project-id': String(projectId)
                }
            })

            expect(res.status).toBe(200)
            const body = await res.json()
            expect(body.name).toBe('items')

            // Verify detail
            const detailRes = await request(app, '/v1/databases/default/collections/items', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookie || '',
                    'x-project-id': String(projectId)
                }
            })
            expect(detailRes.status).toBe(200)
            const detail = await detailRes.json()
            expect(detail.meta.type).toBe('base')
        })
    })

    describe('Fields Management', () => {
        it('should add, rename and delete fields', async () => {
            // Create collection
            await request(app, '/v1/databases/default/collections', {
                method: 'POST',
                body: JSON.stringify({ name: 'articles', idType: 'uuid' }),
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookie || '',
                    'x-project-id': String(projectId)
                }
            })

            // Add Field
            const addRes = await request(app, '/v1/databases/default/collections/articles/fields', {
                method: 'POST',
                body: JSON.stringify({ name: 'title', type: 'text', isNullable: false }),
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookie || '',
                    'x-project-id': String(projectId)
                }
            })
            expect(addRes.status).toBe(200)

            // Rename Field
            const renameRes = await request(app, '/v1/databases/default/collections/articles/fields/title', {
                method: 'PUT', // Controller uses PUT
                body: JSON.stringify({ newName: 'headline' }),
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookie || '',
                    'x-project-id': String(projectId)
                }
            })
            expect(renameRes.status).toBe(200)

            // Delete Field
            const delRes = await request(app, '/v1/databases/default/collections/articles/fields/headline', {
                method: 'DELETE',
                headers: {
                    'Cookie': cookie || '',
                    'x-project-id': String(projectId)
                }
            })
            expect(delRes.status).toBe(200)
        })
    })
})
