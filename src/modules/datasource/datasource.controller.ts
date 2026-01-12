import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { CreateDataSourceSchema } from '../../validators.js'
import { dataSourceService } from './datasource.service.js'

const app = new Hono()

app.post('/', zValidator('json', CreateDataSourceSchema), async (c) => {
    const { name, connectionString, prefix } = c.req.valid('json')
    try {
        const result = await dataSourceService.create(name, connectionString, prefix)
        return c.json(result)
    } catch (e) {
        return c.json({ error: 'Failed to create data source', details: String(e) }, 500)
    }
})

app.get('/', async (c) => {
    const result = await dataSourceService.list()
    return c.json(result)
})

export default app
