import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'

import { CONSTANTS } from '@/constants.js'
import { CreateUserSchema } from '@/validators.js'

import { accountService } from './account.service.js'

const app = new Hono()

// POST /projects/users/
// POST /projects/users/
app.post('/', zValidator('json', CreateUserSchema), async (c) => {
  const projectId = c.req.header(CONSTANTS.HEADERS.PROJECT_ID)!
  const data = c.req.valid('json')
  const result = await accountService.createUser(projectId, data, 'users')
  return c.json(result)
})

// GET /projects/users/
app.get('/', async (c) => {
  const projectId = c.req.header(CONSTANTS.HEADERS.PROJECT_ID)!
  const result = await accountService.listUsers(projectId, 'users')
  return c.json(result)
})

// DELETE /projects/users/:accountId
app.delete('/:accountId', async (c) => {
  const projectId = c.req.header(CONSTANTS.HEADERS.PROJECT_ID)!
  const accountId = c.req.param('accountId')
  await accountService.deleteUser(projectId, accountId, 'users')
  return c.json({ success: true })
})

export default app
