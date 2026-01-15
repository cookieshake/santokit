import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { DynamicDataInsertSchema } from '@/validators.js'
import { dataService } from '@/modules/data/data.service.js'

const app = new Hono()

// Mounted at /:projectId/:collectionName

app.get('/', async (c) => {
    const rawId = c.req.header('x-project-id')!
    const projectId = rawId === 'system' ? 'system' : parseInt(rawId)
    const collectionName = c.req.param('collectionName')!
    const data = await dataService.findAll(projectId, collectionName)
    return c.json(data)
})

app.post('/', zValidator('json', DynamicDataInsertSchema), async (c) => {
    const rawId = c.req.header('x-project-id')!
    const projectId = rawId === 'system' ? 'system' : parseInt(rawId)
    const collectionName = c.req.param('collectionName')!
    const body = c.req.valid('json')
    const result = await dataService.create(projectId, collectionName, body)
    return c.json(result)
})

app.patch('/:id', zValidator('json', DynamicDataInsertSchema), async (c) => {
    const rawId = c.req.header('x-project-id')!
    const projectId = rawId === 'system' ? 'system' : parseInt(rawId)
    const collectionName = c.req.param('collectionName')!
    const id = c.req.param('id')
    const body = c.req.valid('json')
    const result = await dataService.update(projectId, collectionName, id, body)
    return c.json(result)
})

app.delete('/:id', async (c) => {
    const rawId = c.req.header('x-project-id')!
    const projectId = rawId === 'system' ? 'system' : parseInt(rawId)
    const collectionName = c.req.param('collectionName')!
    const id = c.req.param('id')
    const result = await dataService.delete(projectId, collectionName, id)
    return c.json(result)
})

export default app
