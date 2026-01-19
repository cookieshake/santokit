import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'

import { CONSTANTS } from '@/constants.js'
import { databaseRepository } from '@/modules/database/database.repository.js'
import { policyService } from '@/modules/policy/policy.service.js'
import { recordService } from '@/modules/record/record.service.js'
import { DynamicRecordInsertSchema } from '@/validators.js'

const app = new Hono()

// Helper to resolve Database
const resolveDatabaseId = async (c: any) => {
  // Project ID from Header
  const rawProjectId = c.req.header(CONSTANTS.HEADERS.PROJECT_ID)
  // Database Name from Param
  const databaseName = c.req.param('databaseName')

  if (!rawProjectId || !databaseName) {
    throw new Error('Missing project context or database name')
  }

  const projectId = rawProjectId
  const database = await databaseRepository.findByName(projectId, databaseName)
  if (!database) throw new Error(`Database '${databaseName}' not found`)
  return database.id
}

// Helper to get user
const getUser = (c: any) => {
  return c.get('account') || { roles: ['guest'] } // Default to guest if not found (public access?)
}

app.get('/', async (c) => {
  try {
    const rawProjectId = c.req.header(CONSTANTS.HEADERS.PROJECT_ID)!
    const collectionName = c.req.param('collectionName')!

    const databaseId = await resolveDatabaseId(c)
    const projectId = rawProjectId
    const user = getUser(c)

    const policy = await policyService.evaluate(projectId, databaseId, collectionName, 'read', user)
    if (!policy.allowed) return c.json({ error: 'Access Denied' }, 403)

    const data = await recordService.findAll(databaseId, collectionName, policy.filter)
    return c.json(data)
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }
})

app.post('/', zValidator('json', DynamicRecordInsertSchema), async (c) => {
  try {
    const rawProjectId = c.req.header(CONSTANTS.HEADERS.PROJECT_ID)!
    const collectionName = c.req.param('collectionName')!
    const body = c.req.valid('json')

    const databaseId = await resolveDatabaseId(c)
    const projectId = rawProjectId
    const user = getUser(c)

    const policy = await policyService.evaluate(
      projectId,
      databaseId,
      collectionName,
      'create',
      user,
    )
    if (!policy.allowed) return c.json({ error: 'Access Denied' }, 403)

    const result = await recordService.create(databaseId, collectionName, body)
    return c.json(result)
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }
})

app.patch('/:id', zValidator('json', DynamicRecordInsertSchema), async (c) => {
  try {
    const rawProjectId = c.req.header(CONSTANTS.HEADERS.PROJECT_ID)!
    const collectionName = c.req.param('collectionName')!
    const id = c.req.param('id')
    const body = c.req.valid('json')

    const databaseId = await resolveDatabaseId(c)
    const projectId = rawProjectId
    const user = getUser(c)

    const policy = await policyService.evaluate(
      projectId,
      databaseId,
      collectionName,
      'update',
      user,
    )
    if (!policy.allowed) return c.json({ error: 'Access Denied' }, 403)

    const result = await recordService.update(databaseId, collectionName, id, body, policy.filter)
    if (!result) return c.json({ error: 'Not found or permission denied' }, 404)
    return c.json(result)
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }
})

app.delete('/:id', async (c) => {
  try {
    const rawProjectId = c.req.header(CONSTANTS.HEADERS.PROJECT_ID)!
    const collectionName = c.req.param('collectionName')!
    const id = c.req.param('id')

    const databaseId = await resolveDatabaseId(c)
    const projectId = rawProjectId
    const user = getUser(c)

    const policy = await policyService.evaluate(
      projectId,
      databaseId,
      collectionName,
      'delete',
      user,
    )
    if (!policy.allowed) return c.json({ error: 'Access Denied' }, 403)

    const result = await recordService.delete(databaseId, collectionName, id, policy.filter)
    if (!result) return c.json({ error: 'Not found or permission denied' }, 404)
    return c.json(result)
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }
})

export default app
