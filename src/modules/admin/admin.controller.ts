import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { RegisterSchema, LoginSchema } from '@/validators.js'
import { adminService } from './admin.service.js'

const app = new Hono()

app.post('/register', zValidator('json', RegisterSchema), async (c) => {
    const data = c.req.valid('json')
    try {
        const admin = await adminService.register(data)
        return c.json(admin)
    } catch (e) {
        return c.json({ error: 'Admin already exists or internal error' }, 400)
    }
})

app.post('/login', zValidator('json', LoginSchema), async (c) => {
    const { email, password } = c.req.valid('json')
    try {
        const result = await adminService.login(email, password)
        return c.json(result)
    } catch (e) {
        return c.json({ error: 'Invalid email or password' }, 401)
    }
})

export default app
