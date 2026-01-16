import { Hono } from 'hono'
import { authController } from '@/modules/auth/auth.controller.js'
import { authMiddleware } from '@/modules/auth/auth.middleware.js'
import { db } from '@/db/index.js'
// accounts import removed
import { eq } from 'drizzle-orm'
import { handleDbError, AppError } from '@/lib/errors.js'
import { serveStatic } from '@hono/node-server/serve-static'
import { getCookie } from 'hono/cookie'
import { CONSTANTS } from '@/constants.js'


// Controllers
import dataController from '@/modules/data/data.controller.js'
import projectController from '@/modules/project/project.controller.js'
import uiController from '@/modules/ui/ui.controller.js'

import { accountRepository } from '@/modules/account/account.repository.js'

type Variables = {
    account: any;
    user: any;
    session: any;
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
api.route('/auth', authController)

// 2. Data Routes (Protected)
api.use('/data/*', authMiddleware)
api.use('/data/*', async (c, next) => {
    const rawId = c.req.header(CONSTANTS.HEADERS.PROJECT_ID)
    const user = c.get('user')

    if (!rawId) {
        return c.json({ error: `Missing Project ID Header (${CONSTANTS.HEADERS.PROJECT_ID})` }, 400);
    }

    // System Project (Admin Access)
    if (rawId === CONSTANTS.PROJECTS.SYSTEM_ID) {
        if (!user || !user.roles.includes('admin')) {
            return c.json({ error: "Unauthorized System Access" }, 401);
        }
        c.set('account', user); // Alias for legacy code
        return next()
    }

    // Standard Project (User Access)
    const projectId = parseInt(rawId)
    if (isNaN(projectId)) return c.json({ error: "Invalid Project ID" }, 400);

    // TODO: Implement proper project-level permissions if needed.
    // For now, if logged in, you can access.
    // Ideally check if user is member of project or is admin.
    if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    // Temporary: allow admins to access all projects, regular users only their own? 
    // Since we don't have project_members table in schema yet (or we used to but it's not clear), 
    // we'll allow access if authenticated for now.

    c.set('account', user);
    await next()
})

// Mount Unified Data Controller
// Removed :projectId from path, now just /data/:collectionName
api.route('/data/:collectionName', dataController)
api.get('/', (c) => c.text('Santoki Unified API'))

// Project management routes (added if they were missing or implicitly handled)
api.route('/projects', projectController)

app.route('/v1', api)


import { V3 } from 'paseto'
import { config } from '@/config/index.js'

// ...

// --- UI Router (/ui) ---
// Admin UI Protection Middleware
app.use('/ui/*', async (c, next) => {
    if (c.req.path === '/ui/login') return next()

    const token = getCookie(c, CONSTANTS.AUTH.COOKIE_NAME)
    if (!token) {
        return c.redirect('/ui/login')
    }

    try {
        const key = Buffer.from(config.auth.pasetoKey, 'hex')
        const payload: any = await V3.decrypt(token, key)

        // Since UI is primarily for Admins in System context?
        // Check roles from payload or fetch fresh from DB if needed
        // Payload has { id, email, roles, projectId }

        if (!payload.roles || !(payload.roles as string[]).includes('admin')) {
            return c.redirect('/ui/login')
        }

        // Optional: Fetch full user if needed, or just use payload
        // const [user] = await db.select().from(accounts).where(eq(accounts.id, payload.id as string));
        // c.set('account', user);

        c.set('user', {
            id: payload.id,
            email: payload.email,
            roles: payload.roles,
            projectId: payload.projectId
        });

        await next()
    } catch (e) {
        return c.redirect('/ui/login')
    }
})

app.route('/ui', uiController)

// --- Static Assets ---
app.use('/assets/*', serveStatic({ root: './src' }))

export default app
