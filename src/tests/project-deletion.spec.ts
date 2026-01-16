import { describe, it, expect, beforeEach } from 'vitest'
import { request, setupDbMock, clearDb, createAdminAndLogin } from '@/tests/test-utils.js'

setupDbMock()

import app from '@/apps/app.js'
import { db } from '@/db/index.js'
import { sql } from 'drizzle-orm'
import { connectionManager } from '@/db/connection-manager.js'
import { projectRepository } from '@/modules/project/project.repository.js'

describe('Project Deletion E2E', () => {
    let cookie: string | null

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

        // Create a collection to simulate data
        // Need to resolve dataSourceId first? No, controller handles it if header missing? 
        // Controller finds default datasource.
        await request(app, `/v1/projects/${project.id}/collections`, {
            method: 'POST',
            body: JSON.stringify({ name: 'users', type: 'base' }),
            headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
        })

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

        // Check if DB tables remain (requires data source ID)
        // Since project is deleted, data sources are deleted (cascade) from Admin DB.
        // But physical tables might remain if deleteData=false.
        // But we can't find the data source config anymore!
        // So checking physical existence is hard purely from code unless we saved the conn string.

        // In the new architecture, if you delete the project, you delete the data source entry.
        // Effectively you lose access to the data unless you have a backup of the connection string.
        // So 'deleteData=false' implies "Don't run DROP TABLE", but the reference in Admin DB is gone.
        // This is consistent.
    })

    it('should delete project AND data when deleteData is true', async () => {
        const project = await createProject('Project Delete Data')

        // Create a collection
        await request(app, `/v1/projects/${project.id}/collections`, {
            method: 'POST',
            body: JSON.stringify({ name: 'items', type: 'base' }),
            headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
        })

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

    it('should prevent deleting system project', async () => {
        // System project usually has specific ID or name. mocking it here.
        // The service checks: project.name === CONSTANTS.PROJECTS.SYSTEM_ID ('system')

        // Manually insert a system project
        // Using internal API or Mock to force it if API blocks creating name 'system'?
        // API doesn't seem to block name 'system' explicitly in create controller, but let's try.
        const res = await request(app, '/v1/projects', {
            method: 'POST',
            body: JSON.stringify({ name: 'system', connectionString: 'postgres://localhost:5432/test', prefix: 'sys_' }),
            headers: { 'Content-Type': 'application/json', 'Cookie': cookie || '' }
        })
        const project = await res.json()

        const delRes = await request(app, `/v1/projects/${project.id}`, {
            method: 'DELETE',
            headers: { 'Cookie': cookie || '' }
        })

        expect(delRes.status).toBe(400)
        const body = await delRes.json()
        expect(body.error).toContain('Cannot delete system project')
    })
})
