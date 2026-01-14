import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { CreateProjectSchema } from '@/validators.js'
import { projectService } from '@/modules/project/project.service.js'
import collectionController from '@/modules/collection/collection.controller.js'
import userController from '@/modules/user/user.controller.js'

const app = new Hono()

app.post('/', zValidator('json', CreateProjectSchema), async (c) => {
    const { name, dataSourceId } = c.req.valid('json')
    const result = await projectService.create(name, dataSourceId)
    return c.json(result)
})

app.get('/', async (c) => {
    const result = await projectService.list()
    return c.json(result)
})

app.post('/:projectId/associate-datasource', async (c) => {
    const projectId = Number(c.req.param('projectId'))
    const { dataSourceId } = await c.req.json()
    const project = await projectService.associateDataSource(projectId, dataSourceId)
    return c.json(project)
})

// Recursively mount routes: Project -> Collections/Users
// e.g. /projects/:projectId/collections
app.route('/:projectId/collections', collectionController)
app.route('/:projectId/users', userController)


export default app
