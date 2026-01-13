import { Hono } from 'hono'
import { authAdmin } from '@/lib/auth-admin.js'

const app = new Hono()

app.on(['POST', 'GET'], '/*', async (c) => {
    return authAdmin.handler(c.req.raw)
})

export default app
