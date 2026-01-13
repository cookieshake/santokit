import { Hono } from 'hono'
import { authAdmin } from '@/lib/auth-admin.js'
import { authzMiddleware } from '@/lib/authz.middleware.js'
import datasourceController from '@/modules/datasource/datasource.controller.js'
import projectController from '@/modules/project/project.controller.js'
import adminController from '@/modules/admin/admin.controller.js'
import { db } from '@/db/index.js'
import { users } from '@/db/schema.js'
import { eq } from 'drizzle-orm'

const app = new Hono<{
    Variables: {
        user: typeof authAdmin.$Infer.Session.user;
    };
}>().basePath('/v1')

// Public Auth routes
app.route('/auth', adminController)

// Protected routes middleware
app.use('/*', async (c, next) => {
    const session = await authAdmin.api.getSession({
        headers: c.req.raw.headers,
    });
    if (!session) {
        return c.json({ error: "Unauthorized" }, 401);
    }
    // Set user to context for subsequent middlewares
    c.set('user', session.user);
    await next()
})

// Apply Authorization Middleware to all routes after authentication
app.use('/*', authzMiddleware(() => 'admin'))

app.get('/', (c) => c.text('Admin API (Modular Architecture)'))

// Mount Modules
app.route('/sources', datasourceController)
app.route('/projects', projectController)

// --- Admin Management ---
app.get('/admins', async (c) => {
    const allAdmins = await db.select().from(users).where(eq(users.role, 'admin'))
    return c.json(allAdmins)
})

export default app
