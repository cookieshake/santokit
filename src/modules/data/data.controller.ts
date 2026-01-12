import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { DynamicDataInsertSchema } from '../../validators.js'
import { dataService } from './data.service.js'

const app = new Hono()

// Mounted at /:projectId/:collectionName

app.get('/', async (c) => {
    const projectId = parseInt(c.req.param('projectId')!)
    const collectionName = c.req.param('collectionName')!
    try {
        const data = await dataService.findAll(projectId, collectionName)
        return c.json(data)
    } catch (e) {
        return c.json({ error: 'Failed to fetch data', details: String(e) }, 500)
    }
})

app.post('/', zValidator('json', DynamicDataInsertSchema), async (c) => {
    const projectId = parseInt(c.req.param('projectId')!)
    const collectionName = c.req.param('collectionName')!
    const body = c.req.valid('json')
    try {
        const result = await dataService.create(projectId, collectionName, body)
        return c.json(result)
    } catch (e) {
        return c.json({ error: 'Failed to insert data', details: String(e) }, 500)
    }
})

export default app
