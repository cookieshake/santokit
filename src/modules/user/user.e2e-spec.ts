import { describe, it, expect, beforeEach } from 'vitest'
import { request, setupDbMock, clearDb, createAdminAndLogin } from '@/tests/test-utils.js'

setupDbMock()

import app from '@/apps/admin.js'
import { db } from '@/db/index.js'

describe('User Module (Admin) E2E', () => {
    let cookie: string | null
    let projectId: number

    beforeEach(async () => {
        await clearDb(db)
        cookie = await createAdminAndLogin(app)

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

    describe('POST /admin/v1/projects/:projectId/users', () => {
        it('should create a user in the project', async () => {
            const res = await request(app, `/admin/v1/projects/${projectId}/users`, {
                method: 'POST',
                body: JSON.stringify({
                    email: 'user@project.com',
                    password: 'password123',
                    name: 'Project User'
                }),
                headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
            })

            expect(res.status).toBe(200)
            const body = await res.json()
            expect(body.email).toBe('user@project.com')
        })
    })

    describe('GET /admin/v1/projects/:projectId/users', () => {
        it('should list users', async () => {
            // Create user
            await request(app, `/admin/v1/projects/${projectId}/users`, {
                method: 'POST',
                body: JSON.stringify({
                    email: 'u1@p.com',
                    password: 'pw',
                    name: 'U1'
                }),
                headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
            })

            const res = await request(app, `/admin/v1/projects/${projectId}/users`, {
                headers: { 'Cookie': cookie || '' }
            })

            expect(res.status).toBe(200)
            const body = await res.json()
            expect(Array.isArray(body)).toBe(true)
            expect(body.length).toBeGreaterThanOrEqual(1)
        })
    })
})
