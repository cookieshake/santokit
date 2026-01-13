import { Hono } from 'hono'
import { getAuthProject } from '@/lib/auth-project.js'
import { userRepository } from '@/modules/user/user.repository.js'
import dataController from '@/modules/data/data.controller.js'
import userAuthController from '@/modules/user/user.auth.controller.js'

const app = new Hono<{
    Variables: {
        user: any;
    };
}>().basePath('/v1')

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

app.get('/', (c) => c.text('Client API (Modular Architecture)'))

// Mount Data Module
app.route('/data/:projectId/:collectionName', dataController)

export default app
