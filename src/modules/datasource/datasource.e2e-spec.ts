import { describe, it, expect, beforeEach } from 'vitest'
import { request, setupDbMock, clearDb, createAdminAndLogin } from '@/tests/test-utils.js'

setupDbMock()

import app from '@/apps/app.js'
import { db } from '@/db/index.js'

describe('Datasource Module E2E', () => {
    let cookie: string | null

    beforeEach(async () => {
        await clearDb(db)
        cookie = await createAdminAndLogin(app)
    })

    describe('POST /admin/v1/sources', () => {
        it('should create a new datasource', async () => {
            const res = await request(app, '/admin/v1/sources', {
                method: 'POST',
                body: JSON.stringify({
                    name: 'primary-db',
                    connectionString: 'postgres://localhost:5432/santoki_primary',
                    prefix: 'p1_'
                }),
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookie || ''
                }
            })

            expect(res.status).toBe(200)
            const body = await res.json()
            expect(body.name).toBe('primary-db')
            expect(body.id).toBeDefined()
        })

        it('should return 401 if not authenticated', async () => {
            const res = await request(app, '/admin/v1/sources', {
                method: 'POST',
                body: JSON.stringify({
                    name: 'test',
                    connectionString: '...',
                }),
                headers: { 'Content-Type': 'application/json' }
            })
            expect(res.status).toBe(401)
        })
    })

    describe('GET /admin/v1/sources', () => {
        it('should list datasources', async () => {
            // Create one first
            await request(app, '/admin/v1/sources', {
                method: 'POST',
                body: JSON.stringify({
                    name: 'db1',
                    connectionString: 'postgres://...',
                    prefix: 'd1_'
                }),
                headers: {
                    'Content-Type': 'application/json',
                    'Cookie': cookie || ''
                }
            })

            const res = await request(app, '/admin/v1/sources', {
                headers: { 'Cookie': cookie || '' }
            })

            expect(res.status).toBe(200)
            const body = await res.json()
            expect(Array.isArray(body)).toBe(true)
            expect(body.length).toBeGreaterThanOrEqual(1)
            expect(body[0].name).toBe('db1')
        })
    })
})
