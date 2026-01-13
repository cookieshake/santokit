import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { CreateProjectSchema } from '@/validators.js'
import { projectService } from '@/modules/project/project.service.js'
import collectionController from '@/modules/collection/collection.controller.js'
import accountController from '@/modules/account/account.controller.js'

const app = new Hono()

app.post('/', zValidator('json', CreateProjectSchema), async (c) => {
    const { name, ownerId } = c.req.valid('json')
    try {
        const result = await projectService.create(name, ownerId)
        return c.json(result)
    } catch (e) {
        return c.json({ error: 'Failed to create project' }, 500)
    }
})

app.get('/', async (c) => {
    const result = await projectService.list()
    return c.json(result)
})

// Recursively mount routes: Project -> Collections/Accounts
// e.g. /projects/:projectId/collections
app.route('/:projectId/collections', collectionController)
app.route('/:projectId/accounts', accountController)


export default app
