import { Hono } from 'hono'
import { authAdmin } from '@/lib/auth-admin.js'

import { handleDbError, AppError } from '@/lib/errors.js'
import datasourceController from '@/modules/datasource/datasource.controller.js'
import projectController from '@/modules/project/project.controller.js'
import adminController from '@/modules/admin/admin.controller.js'
import { db } from '@/db/index.js'
import { users } from '@/db/schema.js'
import { arrayContains } from 'drizzle-orm'
import uiController from '@/modules/admin/ui.controller.js'
import { serveStatic } from '@hono/node-server/serve-static'

const api = new Hono<{
    Variables: {
        user: typeof authAdmin.$Infer.Session.user;
    };
}>()

const app = new Hono()

app.onError((err, c) => {
    console.error(`[Error] ${c.req.method} ${c.req.path}:`, err)

    if (err instanceof AppError) {
        return c.json({
            error: err.message,
            code: err.code,
            details: err.details
        }, err.status as any)
    }

    // Attempt to handle database errors
    const appErr = handleDbError(err)
    if (appErr.status !== 500 || appErr.code !== 'DATABASE_ERROR') {
        return c.json({
            error: appErr.message,
            code: appErr.code,
            details: appErr.details
        }, appErr.status as any)
    }

    return c.json({
        error: 'Internal Server Error',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
    }, 500)
})

// Serve static assets
app.use('/assets/*', serveStatic({ root: './src' }))

// Shared Auth middleware for both API and UI
const authMiddleware = async (c: any, next: any) => {
    const session = await authAdmin.api.getSession({
        headers: c.req.raw.headers,
    });
    if (!session) {
        if (c.req.path.startsWith('/admin/_') && c.req.path !== '/admin/_/login') {
            return c.redirect('/admin/_/login') // Redirect to login page if UI
        }
        if (!c.req.path.startsWith('/admin/_')) {
            return c.json({ error: "Unauthorized" }, 401);
        }
        return next() // Continue if it's the login page or other public UI
    }
    c.set('user', (session as any).user);
    await next()
}

// Public Auth routes (mounted on api)
api.route('/auth', adminController)

// API routes (prefixed with /v1 in the final app)
api.use('/*', authMiddleware)


api.get('/', (c) => c.text('Admin API (Modular Architecture)'))

// Mount Modules on API
api.route('/sources', datasourceController)
api.route('/projects', projectController)

// --- Admin Management on API ---
api.get('/admins', async (c) => {
    const allAdmins = await db.select().from(users).where(arrayContains(users.roles, ['admin']))
    return c.json(allAdmins)
})

// UI routes (prefixed with /admin/_)
app.use('/admin/_', authMiddleware)
app.route('/admin/_', uiController)

// Mount API on the main app
app.route('/admin/v1', api)

export default app

