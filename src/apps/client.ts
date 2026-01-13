import { Hono } from 'hono'
import { jwt } from 'hono/jwt'
import dataController from '@/modules/data/data.controller.js'
import userAuthController from '@/modules/user/user.auth.controller.js'

const app = new Hono().basePath('/v1')
const JWT_SECRET = process.env.JWT_SECRET || 'secret'

// Public Auth routes for projects
app.route('/auth/:projectId', userAuthController)

// Protected Data routes middleware
app.use('/data/:projectId/*', async (c, next) => {
    const projectId = parseInt(c.req.param('projectId')!)
    const middleware = jwt({ secret: JWT_SECRET })

    return middleware(c, async () => {
        const payload = c.get('jwtPayload')
        // Ensure the token is for THIS project
        if (payload.projectId !== projectId) {
            c.header('Content-Type', 'application/json')
            c.status(401)
            c.res = Response.json({ error: 'Unauthorized: Project mismatch' }, { status: 401 })
            return
        }
        await next()
    })
})

app.get('/', (c) => c.text('Client API (Modular Architecture)'))

// Mount Data Module
app.route('/data/:projectId/:collectionName', dataController)

export default app
