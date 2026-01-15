import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { CreateUserSchema } from '@/validators.js'
import { accountService } from './account.service.js'

const app = new Hono()

// POST /projects/users/
app.post('/', zValidator('json', CreateUserSchema), async (c) => {
    const projectId = Number(c.req.header('x-project-id'))
    const data = c.req.valid('json')
    const result = await accountService.createUser(projectId, data)
    return c.json(result)
})

// GET /projects/users/
app.get('/', async (c) => {
    const projectId = Number(c.req.header('x-project-id'))
    const result = await accountService.listUsers(projectId)
    return c.json(result)
})

// DELETE /projects/users/:accountId
app.delete('/:accountId', async (c) => {
    const projectId = Number(c.req.header('x-project-id'))
    const accountId = Number(c.req.param('accountId'))
    await accountService.deleteUser(projectId, accountId)
    return c.json({ success: true })
})

export default app
