import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import { db } from '@/db/index.js'
import { users } from '@/db/schema.js'
import datasourceController from '@/modules/datasource/datasource.controller.js'
import projectController from '@/modules/project/project.controller.js'

const app = new Hono().basePath('/v1')
const JWT_SECRET = process.env.JWT_SECRET || 'secret'

app.use('/*', jwt({ secret: JWT_SECRET }))

// Auth Middleware: Check for 'admin' role
app.use('/*', async (c, next) => {
    const payload = c.get('jwtPayload')
    if (payload.role !== 'admin') {
        return c.json({ error: 'Forbidden: Admins only' }, 403)
    }
    await next()
})

app.get('/', (c) => c.text('Admin API (Modular Architecture)'))

// Mount Modules
app.route('/sources', datasourceController)
app.route('/projects', projectController)

// --- User Management (Simple enough to keep here for now, or move to module later) ---
app.get('/users', async (c) => {
    const allUsers = await db.select().from(users)
    return c.json(allUsers)
})

export default app
