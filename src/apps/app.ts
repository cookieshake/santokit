import { Hono } from 'hono'
import { authAdmin } from '@/lib/auth-admin.js'
import { getAuthProject } from '@/lib/auth-project.js'
import { handleDbError, AppError } from '@/lib/errors.js'
import { serveStatic } from '@hono/node-server/serve-static'

// Controllers
import dataController from '@/modules/data/data.controller.js'
import accountAuthController from '@/modules/account/account.auth.controller.js'
import projectController from '@/modules/project/project.controller.js'
import uiController from '@/modules/ui/ui.controller.js'

import { accountRepository } from '@/modules/account/account.repository.js'

type Variables = {
    account: any;
}

const app = new Hono<{ Variables: Variables }>()

// --- Global Error Handling ---
app.onError((err, c) => {
    console.error(`[Error] ${c.req.method} ${c.req.path}:`, err)

    if (err instanceof AppError) {
        return c.json({
            error: err.message,
            code: err.code,
            details: err.details
        }, err.status as any)
    }

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

// --- API Router (v1) ---
const api = new Hono<{ Variables: Variables }>()

// 1. Auth Routes
// System Admin Auth
const systemAuth = new Hono()
systemAuth.post('/register', async (c) => {
    const { email, password, name } = await c.req.json()
    // Use BetterAuth API to create admin
    const user = await authAdmin.api.signUpEmail({
        body: {
            email,
            password,
            name: name || email.split('@')[0],
        }
    })

    if (user) {
        return c.json(user)
    }
    return c.json({ error: "Failed to register" }, 400)
})
systemAuth.all('/*', (c) => authAdmin.handler(c.req.raw))

api.route('/auth/system', systemAuth)
// Project User Auth
// Mounted at /v1/auth - Controller handles extracting project ID from header
api.route('/auth', accountAuthController)

// 2. Data Routes (Protected)
api.use('/data/*', async (c, next) => {
    const rawId = c.req.header('x-project-id')

    if (!rawId) {
        return c.json({ error: "Missing Project ID Header (x-project-id)" }, 400);
    }

    // System Project (Admin Access)
    if (rawId === 'system') {
        const session = await authAdmin.api.getSession({
            headers: c.req.raw.headers,
        });
        if (!session) return c.json({ error: "Unauthorized System Access" }, 401);
        c.set('account', session.user); // Admin user
        return next()
    }

    // Standard Project (User Access)
    const projectId = parseInt(rawId)
    if (isNaN(projectId)) return c.json({ error: "Invalid Project ID" }, 400);

    const db = await accountRepository.getDbForProject(projectId)
    const auth = getAuthProject(db)
    const session = await auth.api.getSession({
        headers: c.req.raw.headers,
    });
    if (!session) return c.json({ error: "Unauthorized" }, 401);

    c.set('account', session.user);
    await next()
})

// Mount Unified Data Controller
// Removed :projectId from path, now just /data/:collectionName
api.route('/data/:collectionName', dataController)
api.get('/', (c) => c.text('Santoki Unified API'))

app.route('/v1', api)


// --- UI Router (/ui) ---
// Admin UI Protection Middleware
app.use('/ui/*', async (c, next) => {
    if (c.req.path === '/ui/login') return next()

    const session = await authAdmin.api.getSession({
        headers: c.req.raw.headers,
    });
    if (!session) {
        return c.redirect('/ui/login')
    }
    c.set('account', session.user);
    await next()
})

app.route('/ui', uiController)

// --- Static Assets ---
app.use('/assets/*', serveStatic({ root: './src' }))

export default app
