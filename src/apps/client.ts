import { Hono } from 'hono'
import { getAuthProject } from '@/lib/auth-project.js'
import { handleDbError, AppError } from '@/lib/errors.js'
import { userRepository } from '@/modules/user/user.repository.js'
import dataController from '@/modules/data/data.controller.js'
import userAuthController from '@/modules/user/user.auth.controller.js'


const app = new Hono<{
    Variables: {
        user: any;
    };
}>().basePath('/v1')

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

// Public Auth routes for projects
app.route('/auth/:projectId', userAuthController)

// Protected Data routes middleware
app.use('/data/:projectId/*', async (c, next) => {
    const projectId = parseInt(c.req.param('projectId')!)
    const db = await userRepository.getDbForProject(projectId)
    const auth = getAuthProject(db)

    const session = await auth.api.getSession({
        headers: c.req.raw.headers,
    });

    if (!session) {
        return c.json({ error: "Unauthorized" }, 401);
    }

    c.set('user', session.user);
    await next()
})

// Apply Authorization Middleware to data routes


app.get('/', (c) => c.text('Client API (Modular Architecture)'))

// Mount Data Module
app.route('/data/:projectId/:collectionName', dataController)

export default app
