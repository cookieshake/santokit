import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { RegisterSchema, LoginSchema } from '@/validators.js'
import { accountService } from '@/modules/account/account.service.js'

const app = new Hono()

// Mounted at /v1/auth/:projectId
app.post('/register', zValidator('json', RegisterSchema), async (c) => {
    const projectId = parseInt(c.req.param('projectId')!)
    const data = c.req.valid('json')
    try {
        const acc = await accountService.createAccount(projectId, data)
        return c.json(acc)
    } catch (e: any) {
        return c.json({ error: e.message }, 400)
    }
})

app.post('/login', zValidator('json', LoginSchema), async (c) => {
    const projectId = parseInt(c.req.param('projectId')!)
    const { email, password } = c.req.valid('json')
    try {
        const result = await accountService.login(projectId, email, password)
        return c.json(result)
    } catch (e: any) {
        return c.json({ error: e.message }, 401)
    }
})

export default app
