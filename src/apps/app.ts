import { Hono } from 'hono'
import { authController } from '@/modules/auth/auth.controller.js'
import { authMiddleware } from '@/modules/auth/auth.middleware.js'
import { db } from '@/db/index.js'
import collectionController from '@/modules/collection/collection.controller.js'

import { handleDbError, AppError } from '@/lib/errors.js'
import { serveStatic } from '@hono/node-server/serve-static'
import { getCookie } from 'hono/cookie'
import { CONSTANTS } from '@/constants.js'


// Controllers
import recordController from '@/modules/record/record.controller.js'
import projectController from '@/modules/project/project.controller.js'
import uiController from '@/modules/ui/ui.controller.js'
import policyController from '@/modules/policy/policy.controller.js'

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

// 2. Database Scoped Routes (Protected)
// Mount at new path with database in URL, Project in Header
api.use('/databases/:databaseName/*', authMiddleware)
api.use('/databases/:databaseName/*', async (c, next) => {
    const user = c.get('user')
    // Project ID from Header
    const rawId = c.req.header(CONSTANTS.HEADERS.PROJECT_ID)

    if (!rawId) {
        return c.json({ error: `Missing Project ID Header (${CONSTANTS.HEADERS.PROJECT_ID})` }, 400);
    }

    // Project ID is string
    const projectId = rawId

    if (!user) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    c.set('account', user);
    await next()
})

// Mount Controllers
api.route('/databases/:databaseName/collections', collectionController)
api.route('/databases/:databaseName/policies', policyController)

api.get('/', (c) => c.text('Santoki Unified API'))

// Project management routes
api.use('/projects/*', authMiddleware)
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
        console.log('[UI Auth] No token found in cookie, redirecting to login');
        return c.redirect('/ui/login')
    }

    try {
        const key = Buffer.from(config.auth.pasetoKey, 'hex')
        const payload: any = await V3.decrypt(token, key)

        // Check admin role
        if (!payload.roles || !(payload.roles as string[]).includes('admin')) {
            console.log('[UI Auth] User is not admin', payload.roles);
            return c.redirect('/ui/login')
        }

        const user = {
            id: payload.id,
            email: payload.email,
            roles: payload.roles,
            projectId: payload.projectId
        };
        c.set('user', user);
        c.set('account', user);

        await next()
    } catch (e) {
        console.error('[UI Auth] Token verification failed:', e);
        return c.redirect('/ui/login')
    }
})

app.route('/ui', uiController)

// --- Static Assets ---
app.use('/assets/*', serveStatic({ root: './src' }))

export default app
