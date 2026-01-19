import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'

import { databaseService } from '@/modules/database/database.service.js'
import { CreateDatabaseSchema } from '@/validators.js'

const app = new Hono()

app.post('/', zValidator('json', CreateDatabaseSchema), async (c) => {
  const projectId = c.req.param('projectId')
  if (!projectId) {
    return c.json({ error: 'Project ID is required' }, 400)
  }

  const { name, connectionString, prefix } = c.req.valid('json')
  try {
    const result = await databaseService.create(projectId, name, connectionString, prefix)
    return c.json(result)
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }
})

app.delete('/:dbId', async (c) => {
  const projectId = c.req.param('projectId')
  const dbId = c.req.param('dbId')

  if (!projectId || !dbId) {
    return c.json({ error: 'Project ID and Database ID are required' }, 400)
  }

  try {
    await databaseService.delete(projectId, dbId)
    return c.json({ success: true })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }
})

export default app
