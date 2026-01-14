import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { CreateDataSourceSchema } from '@/validators.js'
import { dataSourceService } from '@/modules/datasource/datasource.service.js'

const app = new Hono()

app.post('/', zValidator('json', CreateDataSourceSchema), async (c) => {
    const { name, connectionString, prefix } = c.req.valid('json')
    const result = await dataSourceService.create(name, connectionString, prefix)
    return c.json(result)
})

app.get('/', async (c) => {
    const result = await dataSourceService.list()
    return c.json(result)
})

export default app
