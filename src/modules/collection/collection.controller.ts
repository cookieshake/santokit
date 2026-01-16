import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { CreateCollectionSchema, AddFieldSchema, RenameFieldSchema, CreateIndexSchema } from '@/validators.js'
import { collectionService } from '@/modules/collection/collection.service.js'
import { CONSTANTS } from '@/constants.js'

const app = new Hono()

// Mounted at /collections

// List Collections
app.get('/', async (c) => {
    const projectId = parseInt(c.req.header(CONSTANTS.HEADERS.PROJECT_ID)!)
    const result = await collectionService.listByProject(projectId)
    return c.json(result)
})

// Create Collection
app.post('/', zValidator('json', CreateCollectionSchema), async (c) => {
    const projectId = parseInt(c.req.header(CONSTANTS.HEADERS.PROJECT_ID)!)
    const { name, idType, type } = c.req.valid('json')
    const result = await collectionService.create(projectId, name, idType as 'serial' | 'uuid', type as 'base' | 'auth')
    return c.json(result)
})

// Get Collection Details
app.get('/:collectionName', async (c) => {
    const projectId = parseInt(c.req.header(CONSTANTS.HEADERS.PROJECT_ID)!)
    const collectionName = c.req.param('collectionName')!
    const result = await collectionService.getDetail(projectId, collectionName)
    return c.json(result)
})

// Add Field
app.post('/:collectionName/fields', zValidator('json', AddFieldSchema), async (c) => {
    const projectId = parseInt(c.req.header(CONSTANTS.HEADERS.PROJECT_ID)!)
    const collectionName = c.req.param('collectionName')!
    const { name, type, isNullable } = c.req.valid('json')
    await collectionService.addField(projectId, collectionName, name, type, !!isNullable)
    return c.json({ message: `Field ${name} added` })
})

// Update Field (Pop Quiz: Why PUT? Because it's an update)
app.put('/:collectionName/fields/:fieldName', zValidator('json', RenameFieldSchema), async (c) => {
    const projectId = parseInt(c.req.header(CONSTANTS.HEADERS.PROJECT_ID)!)
    const collectionName = c.req.param('collectionName')!
    const oldName = c.req.param('fieldName')!
    const { newName } = c.req.valid('json')
    await collectionService.renameField(projectId, collectionName, oldName, newName)
    return c.json({ message: `Field renamed` })
})

// Delete Field
app.delete('/:collectionName/fields/:fieldName', async (c) => {
    const projectId = parseInt(c.req.header(CONSTANTS.HEADERS.PROJECT_ID)!)
    const collectionName = c.req.param('collectionName')!
    const fieldName = c.req.param('fieldName')!
    await collectionService.removeField(projectId, collectionName, fieldName)
    return c.json({ message: `Field deleted` })
})

// Create Index
app.post('/:collectionName/indexes', zValidator('json', CreateIndexSchema), async (c) => {
    const projectId = parseInt(c.req.header(CONSTANTS.HEADERS.PROJECT_ID)!)
    const collectionName = c.req.param('collectionName')!
    const { indexName, fields, unique } = c.req.valid('json')
    const fullIndexName = await collectionService.createIndex(projectId, collectionName, indexName, fields, !!unique)
    return c.json({ message: `Index ${fullIndexName} created` })
})

// Delete Index
app.delete('/:collectionName/indexes/:indexName', async (c) => {
    const projectId = parseInt(c.req.header(CONSTANTS.HEADERS.PROJECT_ID)!)
    const collectionName = c.req.param('collectionName')!
    const indexName = c.req.param('indexName')!
    const fullIndexName = await collectionService.removeIndex(projectId, collectionName, indexName)
    return c.json({ message: `Index ${fullIndexName} deleted` })
})

import dataController from '@/modules/data/data.controller.js'

app.route('/:collectionName/data', dataController)

export default app
