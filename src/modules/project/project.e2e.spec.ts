import { describe, it, expect, beforeEach } from 'vitest'
import { request, setupDbMock, clearDb, createAdminAndLogin, createRegularUserAndLogin } from '@/tests/test-utils.js'

setupDbMock()

import app from '@/apps/app.js'
import { db } from '@/db/index.js'

describe('Project Module E2E', () => {
    let cookie: string | null

    beforeEach(async () => {
        await clearDb(db)
        cookie = await createAdminAndLogin(app)
    })

    describe('POST /v1/projects', () => {
        it('should create a new project', async () => {
            const res = await request(app, '/v1/projects', {
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

    describe('GET /v1/projects', () => {
        it('should list projects', async () => {
            await request(app, '/v1/projects', {
                method: 'POST',
                body: JSON.stringify({
                    name: 'Project A'
                }),
                headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
            })

            const res = await request(app, '/v1/projects', {
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

    describe('RBAC', () => {
        let userCookie: string | null

        beforeEach(async () => {
            userCookie = await createRegularUserAndLogin(app)
        })

        it('should forbid non-admin users from creating projects', async () => {
            const res = await request(app, '/v1/projects', {
                method: 'POST',
                body: JSON.stringify({ name: 'Hacked Project' }),
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': userCookie || ''
                }
            })

            expect(res.status).toBe(403)
        })

        it('should forbid non-admin users from listing projects', async () => {
            const res = await request(app, '/v1/projects', {
                headers: { 'Cookie': userCookie || '' }
            })

            expect(res.status).toBe(403)
        })
    })
})
