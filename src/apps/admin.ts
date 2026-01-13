import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import { db } from '@/db/index.js'
import { admins } from '@/db/schema.js'
import datasourceController from '@/modules/datasource/datasource.controller.js'
import projectController from '@/modules/project/project.controller.js'
import adminController from '@/modules/admin/admin.controller.js'


const app = new Hono().basePath('/v1')
const JWT_SECRET = process.env.JWT_SECRET || 'secret'

// Public Auth routes
app.route('/auth', adminController)

// Protected routes middleware
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

// --- Admin Management ---
app.get('/admins', async (c) => {
    const allAdmins = await db.select().from(admins)
    return c.json(allAdmins)
})

export default app
