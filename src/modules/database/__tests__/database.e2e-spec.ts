import { describe, it, expect, beforeEach } from 'vitest'

import { request, setupDbMock, clearDb, createAdminAndLogin } from '@/tests/test-utils.js'

setupDbMock()

import app from '@/apps/app.js'
import { db } from '@/db/index.js'

describe('Database Module E2E', () => {
  let cookie: string | null

  beforeEach(async () => {
    await clearDb(db)
    cookie = await createAdminAndLogin(app)
  })

  describe('POST /v1/projects/:id/databases', () => {
    it('should create a database for a project', async () => {
      // Create Project
      const projRes = await request(app, '/v1/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'DB Project' }),
        headers: { 'Content-Type': 'application/json', Cookie: cookie || '' },
      })
      const project = await projRes.json()

      // Add Database
      const res = await request(app, `/v1/projects/${project.id}/databases`, {
        method: 'POST',
        body: JSON.stringify({
          name: 'default',
          connectionString: 'postgres://localhost:5432/db_proj',
          prefix: 'p_',
        }),
        headers: { 'Content-Type': 'application/json', Cookie: cookie || '' },
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.name).toBe('default')
      expect(body.project_id).toBe(project.id)
    })
  })

  describe('DELETE /v1/projects/:id/databases/:dbId', () => {
    it('should delete a database', async () => {
      // Create Project
      const projRes = await request(app, '/v1/projects', {
        method: 'POST',
        body: JSON.stringify({ name: 'DB Project' }),
        headers: { 'Content-Type': 'application/json', Cookie: cookie || '' },
      })
      const project = await projRes.json()

      // Add Database
      const dbRes = await request(app, `/v1/projects/${project.id}/databases`, {
        method: 'POST',
        body: JSON.stringify({
          name: 'default',
          connectionString: 'postgres://localhost:5432/db_proj',
          prefix: 'p_',
        }),
        headers: { 'Content-Type': 'application/json', Cookie: cookie || '' },
      })
      const database = await dbRes.json()

      // Delete Database
      const res = await request(app, `/v1/projects/${project.id}/databases/${database.id}`, {
        method: 'DELETE',
        headers: { Cookie: cookie || '' },
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.success).toBe(true)
    })
  })
})
