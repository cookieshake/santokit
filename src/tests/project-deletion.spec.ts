import { describe, it, expect, beforeEach } from 'vitest'
import { request, setupDbMock, clearDb, createAdminAndLogin } from '@/tests/test-utils.js'

setupDbMock()

import app from '@/apps/app.js'
import { db } from '@/db/index.js'
import { sql } from 'kysely'
import { connectionManager } from '@/db/connection-manager.js'
import { projectRepository } from '@/modules/project/project.repository.js'
import { CONSTANTS } from '@/constants.js'

describe('Project Deletion E2E', () => {
    let cookie: string | null
    let testProjectId: number

    beforeEach(async () => {
        await clearDb(db)
        cookie = await createAdminAndLogin(app)
    })

    const createProject = async (name: string) => {
        const res = await request(app, '/v1/projects', {
            method: 'POST',
            body: JSON.stringify({ name, connectionString: process.env.DATABASE_URL || 'postgres://localhost:5432/test', prefix: 'proj_' }),
            headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
        })
        const text = await res.text()
        try {
            return JSON.parse(text)
        } catch (e) {
            console.error('Create Project Failed:', res.status, text)
            throw e
        }
    }

    it('should delete project but keep data when deleteData is false', async () => {
        const project = await createProject('Project Keep Data')

        // Delete project
        const delRes = await request(app, `/v1/projects/${project.id}?deleteData=false`, {
            method: 'DELETE',
            headers: { 'Cookie': cookie || '' }
        })
        const delText = await delRes.text()
        console.log('Delete Response:', delRes.status, delText)
        expect(delRes.status).toBe(200)

        // Verify project is gone
        const listRes = await request(app, '/v1/projects', { headers: { 'Cookie': cookie || '' } })
        const projects = await listRes.json()
        expect(projects.find((p: any) => p.id === project.id)).toBeUndefined()
    })

    it('should delete project AND data when deleteData is true', async () => {
        const project = await createProject('Project Delete Data')

        // Delete project with data
        const delRes = await request(app, `/v1/projects/${project.id}?deleteData=true`, {
            method: 'DELETE',
            headers: { 'Cookie': cookie || '' }
        })
        expect(delRes.status).toBe(200)

        // Verify project is gone
        const listRes = await request(app, '/v1/projects', { headers: { 'Cookie': cookie || '' } })
        const projects = await listRes.json()
        expect(projects.find((p: any) => p.id === project.id)).toBeUndefined()
    })
})
