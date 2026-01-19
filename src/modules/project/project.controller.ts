import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'

import accountController from '@/modules/account/account.controller.js'
import { requireRoles } from '@/modules/auth/auth.middleware.js'
import collectionController from '@/modules/collection/collection.controller.js'
import databaseController from '@/modules/database/database.controller.js'
import { projectService } from '@/modules/project/project.service.js'
import { CreateProjectSchema } from '@/validators.js'

const app = new Hono()

app.post('/', requireRoles(['admin']), zValidator('json', CreateProjectSchema), async (c) => {
  const { name } = c.req.valid('json')
  const result = await projectService.create(name)
  return c.json(result)
})

app.delete('/:id', requireRoles(['admin']), async (c) => {
  const id = c.req.param('id')
  const deleteData = c.req.query('deleteData') === 'true'

  try {
    await projectService.delete(id, deleteData)
    return c.json({ success: true })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }
})

app.get('/', requireRoles(['admin']), async (c) => {
  const result = await projectService.list()
  return c.json(result)
})

// Recursively mount routes: Project -> Database/Collections/Users
app.route('/:projectId/databases', databaseController)
app.route('/collections', collectionController)
app.route('/users', accountController)

export default app
