import { describe, it, expect, beforeEach } from 'vitest'

import { request, setupDbMock, clearDb, createAdminAndLogin } from '@/tests/test-utils.js'

setupDbMock()

import app from '@/apps/app.js'
import { db } from '@/db/index.js'

describe('User Module (Admin) E2E', () => {
  let cookie: string | null
  let projectId: string

  beforeEach(async () => {
    await clearDb(db)
    cookie = await createAdminAndLogin(app)

    const projRes = await request(app, '/v1/projects', {
      method: 'POST',
      body: JSON.stringify({ name: 'P1' }),
      headers: { 'Content-Type': 'application/json', Cookie: cookie || '' },
    })
    const project = await projRes.json()
    projectId = project.id

    // Create Database (Required for Accounts)
    await request(app, `/v1/projects/${projectId}/databases`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'default',
        connectionString: 'postgres://localhost:5432/test_db',
        prefix: 'test_',
      }),
      headers: { 'Content-Type': 'application/json', Cookie: cookie || '' },
    })
  })

  describe('POST /v1/projects/users', () => {
    it('should create a user in the project', async () => {
      const res = await request(app, '/v1/projects/users', {
        method: 'POST',
        body: JSON.stringify({
          email: 'user@project.com',
          password: 'password123',
          name: 'Project User',
        }),
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie || '',
          'x-project-id': projectId.toString(),
        },
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.email).toBe('user@project.com')
    })
  })

  describe('GET /v1/projects/users', () => {
    it('should list users', async () => {
      // Create user
      await request(app, '/v1/projects/users', {
        method: 'POST',
        body: JSON.stringify({
          email: 'u1@p.com',
          password: 'password123',
          name: 'U1',
        }),
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie || '',
          'x-project-id': projectId.toString(),
        },
      })

      const res = await request(app, '/v1/projects/users', {
        headers: {
          Cookie: cookie || '',
          'x-project-id': projectId.toString(),
        },
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
      expect(body.length).toBeGreaterThanOrEqual(1)
    })
  })
})
