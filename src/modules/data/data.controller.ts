import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { DynamicDataInsertSchema } from '@/validators.js'
import { dataService } from '@/modules/data/data.service.js'

const app = new Hono()

// Mounted at /:projectId/:collectionName

app.get('/', async (c) => {
    const projectId = parseInt(c.req.param('projectId')!)
    const collectionName = c.req.param('collectionName')!
    const data = await dataService.findAll(projectId, collectionName)
    return c.json(data)
})

app.post('/', zValidator('json', DynamicDataInsertSchema), async (c) => {
    const projectId = parseInt(c.req.param('projectId')!)
    const collectionName = c.req.param('collectionName')!
    const body = c.req.valid('json')
    const result = await dataService.create(projectId, collectionName, body)
    return c.json(result)
})

export default app
