import { Hono } from 'hono'
import { authAdmin } from '@/lib/auth-admin.js'
import { adminService } from './admin.service.js'

const app = new Hono()

app.post('/register', async (c) => {
    const { email, password } = await c.req.json()
    try {
        const result = await adminService.register({ email, password, name: email.split('@')[0], roles: ['admin'] })
        return c.json(result)
    } catch (e: any) {
        return c.json({ error: e.message }, 400)
    }
})

app.on(['POST', 'GET'], '/*', async (c) => {
    return authAdmin.handler(c.req.raw)
})

export default app
