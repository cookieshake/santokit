import { Hono } from 'hono'
import { authAdmin } from '@/lib/auth-admin.js'
import { adminService } from './admin.service.js'

const app = new Hono()

app.post('/register', async (c) => {
    const { email, password } = await c.req.json()
    const result = await adminService.register({ email, password, name: email.split('@')[0], roles: ['admin'] })
    return c.json(result)
})

app.on(['POST', 'GET'], '/*', async (c) => {
    return authAdmin.handler(c.req.raw)
})

export default app
