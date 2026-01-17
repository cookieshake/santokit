import { describe, it, expect, beforeEach } from 'vitest'
import { request, setupDbMock, clearDb, createAdminAndLogin } from '@/tests/test-utils.js'

setupDbMock()

import app from '@/apps/app.js'
import { db } from '@/db/index.js'

describe('Project Module E2E', () => {
    let cookie: string | null

    beforeEach(async () => {
        await clearDb(db)
        cookie = await createAdminAndLogin(app)
    })

    describe('POST /admin/v1/projects', () => {
        it('should create a new project', async () => {
            const res = await request(app, '/admin/v1/projects', {
                method: 'POST',
                body: JSON.stringify({
                    name: 'My Project'
                }),
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookie || ''
                }
            })

            expect(res.status).toBe(200)
            const body = await res.json()
            expect(body.name).toBe('My Project')
        })
    })

    describe('GET /admin/v1/projects', () => {
        it('should list projects', async () => {
            await request(app, '/admin/v1/projects', {
                method: 'POST',
                body: JSON.stringify({
                    name: 'Project A'
                }),
                headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
            })

            const res = await request(app, '/admin/v1/projects', {
                headers: { 'Cookie': cookie || '' }
            })

            expect(res.status).toBe(200)
            const body = await res.json()
            expect(Array.isArray(body)).toBe(true)
            expect(body.length).toBeGreaterThanOrEqual(1)
            const projectA = body.find((p: any) => p.name === 'Project A')
            expect(projectA).toBeDefined()
        })
    })

    describe('POST /admin/v1/projects/:id/databases', () => {
        it('should create a database for a project', async () => {
            // Create Project
            const projRes = await request(app, '/admin/v1/projects', {
                method: 'POST',
                body: JSON.stringify({ name: 'DB Project' }),
                headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
            })
            const project = await projRes.json()

            // Add Database
            const res = await request(app, `/admin/v1/projects/${project.id}/databases`, {
                method: 'POST',
                body: JSON.stringify({
                    name: 'default',
                    connectionString: 'postgres://localhost:5432/db_proj',
                    prefix: 'p_'
                }),
                headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
            })

            expect(res.status).toBe(200)
            const body = await res.json()
            expect(body.name).toBe('default')
            expect(body.project_id).toBe(project.id)
        })
    })
})
