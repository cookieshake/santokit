import { describe, it, expect, beforeEach } from 'vitest'
import { request, setupDbMock, clearDb, createAdminAndLogin } from '@/tests/test-utils.js'

setupDbMock()

import app from '@/apps/admin.js'
import { db } from '@/db/index.js'

describe('Collection Module E2E', () => {
    let cookie: string | null
    let projectId: number

    beforeEach(async () => {
        await clearDb(db)
        cookie = await createAdminAndLogin(app)

        // Setup Project
        const dsRes = await request(app, '/admin/v1/sources', {
            method: 'POST',
            body: JSON.stringify({ name: 'ds1', connectionString: 'postgres://...', prefix: '1_' }),
            headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
        })
        const ds = await dsRes.json()

        const projRes = await request(app, '/admin/v1/projects', {
            method: 'POST',
            body: JSON.stringify({ name: 'P1', dataSourceId: ds.id }),
            headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
        })
        const project = await projRes.json()
        projectId = project.id
    })

    describe('POST /admin/v1/projects/:projectId/collections', () => {
        it('should create a collection', async () => {
            const res = await request(app, `/admin/v1/projects/${projectId}/collections`, {
                method: 'POST',
                body: JSON.stringify({ name: 'users', idType: 'serial' }),
                headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
            })

            expect(res.status).toBe(200)
            const body = await res.json()
            expect(body.name).toBe('users')
        })
    })

    describe('Fields Management', () => {
        it('should add, rename and delete fields', async () => {
            // Create collection
            await request(app, `/admin/v1/projects/${projectId}/collections`, {
                method: 'POST',
                body: JSON.stringify({ name: 'articles', idType: 'uuid' }),
                headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
            })

            // Add Field
            const addRes = await request(app, `/admin/v1/projects/${projectId}/collections/articles/fields`, {
                method: 'POST',
                body: JSON.stringify({ name: 'title', type: 'text', isNullable: false }),
                headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
            })
            expect(addRes.status).toBe(200)

            // Rename Field
            const renameRes = await request(app, `/admin/v1/projects/${projectId}/collections/articles/fields/title`, {
                method: 'PUT', // Controller uses PUT
                body: JSON.stringify({ newName: 'headline' }),
                headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
            })
            expect(renameRes.status).toBe(200)

            // Delete Field
            const delRes = await request(app, `/admin/v1/projects/${projectId}/collections/articles/fields/headline`, {
                method: 'DELETE',
                headers: { 'Cookie': cookie || '' }
            })
            expect(delRes.status).toBe(200)
        })
    })
})
