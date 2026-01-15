import { describe, it, expect, beforeEach } from 'vitest'
import { request, setupDbMock, clearDb, createAdminAndLogin } from '@/tests/test-utils.js'

setupDbMock()

import app from '@/apps/admin.js'
import { db } from '@/db/index.js'

describe('Project Module E2E', () => {
    let cookie: string | null

    beforeEach(async () => {
        await clearDb(db)
        cookie = await createAdminAndLogin(app)
    })

    describe('POST /admin/v1/projects', () => {
        it('should create a new project', async () => {
            // First create a datasource
            const dsRes = await request(app, '/admin/v1/sources', {
                method: 'POST',
                body: JSON.stringify({
                    name: 'default-ds',
                    connectionString: 'postgres://...',
                    prefix: 'ds1_'
                }),
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookie || ''
                }
            })
            const ds = await dsRes.json()

            const res = await request(app, '/admin/v1/projects', {
                method: 'POST',
                body: JSON.stringify({
                    name: 'My Project',
                    dataSourceId: ds.id
                }),
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookie || ''
                }
            })

            expect(res.status).toBe(200)
            const body = await res.json()
            expect(body.name).toBe('My Project')
            expect(body.dataSourceId).toBe(ds.id)
        })
    })

    describe('GET /admin/v1/projects', () => {
        it('should list projects', async () => {
            // Create DS and Project
            const dsRes = await request(app, '/admin/v1/sources', {
                method: 'POST',
                body: JSON.stringify({
                    name: 'default-ds',
                    connectionString: 'postgres://...',
                    prefix: 'ds1_'
                }),
                headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
            })
            const ds = await dsRes.json()

            await request(app, '/admin/v1/projects', {
                method: 'POST',
                body: JSON.stringify({
                    name: 'Project A',
                    dataSourceId: ds.id
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
            expect(body[0].name).toBe('Project A')
        })
    })

    describe('POST /admin/v1/projects/:id/associate-datasource', () => {
        it('should associate a datasource', async () => {
            // Create DS 1
            const ds1Res = await request(app, '/admin/v1/sources', {
                method: 'POST',
                body: JSON.stringify({ name: 'ds1', connectionString: '...', prefix: '1_' }),
                headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
            })
            const ds1 = await ds1Res.json()

            // Create DS 2
            const ds2Res = await request(app, '/admin/v1/sources', {
                method: 'POST',
                body: JSON.stringify({ name: 'ds2', connectionString: '...', prefix: '2_' }),
                headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
            })
            const ds2 = await ds2Res.json()

            // Create Project with DS 1
            const projRes = await request(app, '/admin/v1/projects', {
                method: 'POST',
                body: JSON.stringify({ name: 'Project Switch', dataSourceId: ds1.id }),
                headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
            })
            const project = await projRes.json()

            // Switch to DS 2
            const res = await request(app, `/admin/v1/projects/${project.id}/associate-datasource`, {
                method: 'POST',
                body: JSON.stringify({ dataSourceId: ds2.id }),
                headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
            })

            expect(res.status).toBe(200)
            const body = await res.json()
            expect(body.dataSourceId).toBe(ds2.id)
        })
    })
})
