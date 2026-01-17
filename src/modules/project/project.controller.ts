import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { CreateProjectSchema, CreateDatabaseSchema } from '@/validators.js'
import { projectService } from '@/modules/project/project.service.js'
import collectionController from '@/modules/collection/collection.controller.js'
import accountController from '@/modules/account/account.controller.js'

const app = new Hono()

app.post('/', zValidator('json', CreateProjectSchema), async (c) => {
    const { name, connectionString, prefix, databaseName } = c.req.valid('json')
    const result = await projectService.create(name, connectionString, prefix, databaseName)
    return c.json(result)
})

app.post('/:id/databases', zValidator('json', CreateDatabaseSchema), async (c) => {
    const projectId = parseInt(c.req.param('id'))
    const { name, connectionString, prefix } = c.req.valid('json')
    try {
        const result = await projectService.createDatabase(projectId, name, connectionString, prefix)
        return c.json(result)
    } catch (e) {
        return c.json({ error: (e as Error).message }, 400)
    }
})

app.delete('/:id/databases/:dbId', async (c) => {
    const projectId = parseInt(c.req.param('id'))
    const dbId = parseInt(c.req.param('dbId'))

    try {
        await projectService.deleteDatabase(projectId, dbId)
        return c.json({ success: true })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 400)
    }
})

app.delete('/:id', async (c) => {
    const id = parseInt(c.req.param('id'))
    const deleteData = c.req.query('deleteData') === 'true'

    try {
        await projectService.delete(id, deleteData)
        return c.json({ success: true })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 400)
    }
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
