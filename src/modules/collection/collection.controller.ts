import { zValidator } from '@hono/zod-validator'
import { Hono } from 'hono'

import { CONSTANTS } from '@/constants.js'
import { collectionService } from '@/modules/collection/collection.service.js'
import { databaseRepository } from '@/modules/database/database.repository.js'
import recordController from '@/modules/record/record.controller.js'
import {
  CreateCollectionSchema,
  AddFieldSchema,
  RenameFieldSchema,
  CreateIndexSchema,
} from '@/validators.js'

const app = new Hono()

// Helper to resolve Database from URL Params
const resolveDatabaseId = async (c: any) => {
  // Project ID from Header
  const rawProjectId = c.req.header(CONSTANTS.HEADERS.PROJECT_ID)
  // Database Name from URL
  const databaseName = c.req.param('databaseName')

  if (!rawProjectId || !databaseName) {
    throw new Error('Missing project context or database name in URL')
  }

  const projectId = rawProjectId

  const database = await databaseRepository.findByName(projectId, databaseName)
  if (!database)
    throw new Error(`Database '${databaseName}' not found in project '${rawProjectId}'`)

  return database.id
}

// Mounted at /databases/:databaseName/collections

// List Collections
app.get('/', async (c) => {
  try {
    const databaseId = await resolveDatabaseId(c)
    const result = await collectionService.listByDatabase(databaseId)
    return c.json(result)
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }
})

// Create Collection
app.post('/', zValidator('json', CreateCollectionSchema), async (c) => {
  try {
    const databaseId = await resolveDatabaseId(c)
    const { name, idType, type } = c.req.valid('json')
    const dryRun = c.req.query('preview') === 'true'
    const result = await collectionService.create(
      databaseId,
      name,
      idType as 'serial' | 'uuid' | 'typeid',
      type as 'base' | 'auth',
      dryRun,
    )
    return c.json(result)
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }
})

// Get Collection Details
app.get('/:collectionName', async (c) => {
  try {
    const databaseId = await resolveDatabaseId(c)
    const collectionName = c.req.param('collectionName')!
    const result = await collectionService.getDetail(databaseId, collectionName)
    return c.json(result)
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }
})

// Add Field
app.post('/:collectionName/fields', zValidator('json', AddFieldSchema), async (c) => {
  try {
    const databaseId = await resolveDatabaseId(c)
    const collectionName = c.req.param('collectionName')!
    const { name, type, isNullable } = c.req.valid('json')
    const dryRun = c.req.query('preview') === 'true'
    const result = await collectionService.addField(
      databaseId,
      collectionName,
      name,
      type,
      !!isNullable,
      dryRun,
    )
    if (dryRun) return c.json(result)
    return c.json({ message: `Field ${name} added` })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }
})

// Update Field (Pop Quiz: Why PUT? Because it's an update)
app.put('/:collectionName/fields/:fieldName', zValidator('json', RenameFieldSchema), async (c) => {
  try {
    const databaseId = await resolveDatabaseId(c)
    const collectionName = c.req.param('collectionName')!
    const oldName = c.req.param('fieldName')!
    const { newName } = c.req.valid('json')
    const dryRun = c.req.query('preview') === 'true'
    const result = await collectionService.renameField(
      databaseId,
      collectionName,
      oldName,
      newName,
      dryRun,
    )
    if (dryRun) return c.json(result)
    return c.json({ message: `Field renamed` })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }
})

// Delete Field
app.delete('/:collectionName/fields/:fieldName', async (c) => {
  try {
    const databaseId = await resolveDatabaseId(c)
    const collectionName = c.req.param('collectionName')!
    const fieldName = c.req.param('fieldName')!
    const dryRun = c.req.query('preview') === 'true'
    const result = await collectionService.removeField(
      databaseId,
      collectionName,
      fieldName,
      dryRun,
    )
    if (dryRun) return c.json(result)
    return c.json({ message: `Field deleted` })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }
})

// Create Index
app.post('/:collectionName/indexes', zValidator('json', CreateIndexSchema), async (c) => {
  try {
    const databaseId = await resolveDatabaseId(c)
    const collectionName = c.req.param('collectionName')!
    const { indexName, fields, unique } = c.req.valid('json')
    const dryRun = c.req.query('preview') === 'true'
    const result = await collectionService.createIndex(
      databaseId,
      collectionName,
      indexName,
      fields,
      !!unique,
      dryRun,
    )
    if (dryRun) return c.json(result)
    // result is fullIndexName (string) if not dryRun
    return c.json({ message: `Index ${result} created` })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }
})

// Delete Index
app.delete('/:collectionName/indexes/:indexName', async (c) => {
  try {
    const databaseId = await resolveDatabaseId(c)
    const collectionName = c.req.param('collectionName')!
    const indexName = c.req.param('indexName')!
    const dryRun = c.req.query('preview') === 'true'
    const result = await collectionService.removeIndex(
      databaseId,
      collectionName,
      indexName,
      dryRun,
    )
    if (dryRun) return c.json(result)
    return c.json({ message: `Index ${result} deleted` })
  } catch (e) {
    return c.json({ error: (e as Error).message }, 400)
  }
})

app.route('/:collectionName/records', recordController)

export default app
