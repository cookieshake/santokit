import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { CreateUserSchema } from '@/validators.js'
import { userService } from './user.service.js'

const app = new Hono()

// POST /projects/:projectId/users/
app.post('/', zValidator('json', CreateUserSchema), async (c) => {
    const projectId = Number(c.req.param('projectId'))
    const data = c.req.valid('json')
    const result = await userService.createUser(projectId, data)
    return c.json(result)
})

// GET /projects/:projectId/users/
app.get('/', async (c) => {
    const projectId = Number(c.req.param('projectId'))
    const result = await userService.listUsers(projectId)
    return c.json(result)
})

// DELETE /projects/:projectId/users/:userId
app.delete('/:userId', async (c) => {
    const projectId = Number(c.req.param('projectId'))
    const userId = Number(c.req.param('userId'))
    await userService.deleteUser(projectId, userId)
    return c.json({ success: true })
})

export default app
