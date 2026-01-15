import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { CreateProjectSchema } from '@/validators.js'
import { projectService } from '@/modules/project/project.service.js'
import collectionController from '@/modules/collection/collection.controller.js'
import accountController from '@/modules/account/account.controller.js'

const app = new Hono()

app.post('/', zValidator('json', CreateProjectSchema), async (c) => {
    const { name, connectionString, prefix } = c.req.valid('json')
    const result = await projectService.create(name, connectionString, prefix)
    return c.json(result)
})

app.get('/', async (c) => {
    const result = await projectService.list()
    return c.json(result)
})

// associate-datasource route removed

// Recursively mount routes: Project -> Collections/Users
// e.g. /projects/:projectId/collections
// Recursively mount routes: Project -> Collections/Users
// e.g. /projects/collections
app.route('/collections', collectionController)
app.route('/users', accountController)


export default app
