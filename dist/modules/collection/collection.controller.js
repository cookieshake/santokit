import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { CreateCollectionSchema, AddFieldSchema, RenameFieldSchema, CreateIndexSchema } from '../../validators.js';
import { collectionService } from './collection.service.js';
const app = new Hono();
// Mounted at /:projectId/collections
// List Collections
app.get('/', async (c) => {
    const projectId = parseInt(c.req.param('projectId'));
    try {
        const result = await collectionService.listByProject(projectId);
        return c.json(result);
    }
    catch (e) {
        return c.json({ error: 'Failed to list collections' }, 500);
    }
});
// Create Collection
app.post('/', zValidator('json', CreateCollectionSchema), async (c) => {
    const projectId = parseInt(c.req.param('projectId'));
    const { name, dataSourceId } = c.req.valid('json');
    try {
        const result = await collectionService.create(projectId, name, dataSourceId);
        return c.json(result);
    }
    catch (e) {
        return c.json({ error: 'Failed to create collection', details: String(e) }, 500);
    }
});
// Get Collection Details
app.get('/:collectionName', async (c) => {
    const projectId = parseInt(c.req.param('projectId'));
    const collectionName = c.req.param('collectionName');
    try {
        const result = await collectionService.getDetail(projectId, collectionName);
        return c.json(result);
    }
    catch (e) {
        return c.json({ error: 'Failed to get details', details: String(e) }, 500);
    }
});
// Add Field
app.post('/:collectionName/fields', zValidator('json', AddFieldSchema), async (c) => {
    const projectId = parseInt(c.req.param('projectId'));
    const collectionName = c.req.param('collectionName');
    const { name, type, isNullable } = c.req.valid('json');
    try {
        await collectionService.addField(projectId, collectionName, name, type, !!isNullable);
        return c.json({ message: `Field ${name} added` });
    }
    catch (e) {
        return c.json({ error: 'Failed to add field', details: String(e) }, 500);
    }
});
// Update Field (Pop Quiz: Why PUT? Because it's an update)
app.put('/:collectionName/fields/:fieldName', zValidator('json', RenameFieldSchema), async (c) => {
    const projectId = parseInt(c.req.param('projectId'));
    const collectionName = c.req.param('collectionName');
    const oldName = c.req.param('fieldName');
    const { newName } = c.req.valid('json');
    try {
        await collectionService.renameField(projectId, collectionName, oldName, newName);
        return c.json({ message: `Field renamed` });
    }
    catch (e) {
        return c.json({ error: 'Failed to rename field', details: String(e) }, 500);
    }
});
// Delete Field
app.delete('/:collectionName/fields/:fieldName', async (c) => {
    const projectId = parseInt(c.req.param('projectId'));
    const collectionName = c.req.param('collectionName');
    const fieldName = c.req.param('fieldName');
    try {
        await collectionService.removeField(projectId, collectionName, fieldName);
        return c.json({ message: `Field deleted` });
    }
    catch (e) {
        return c.json({ error: 'Failed to delete field', details: String(e) }, 500);
    }
});
// Create Index
app.post('/:collectionName/indexes', zValidator('json', CreateIndexSchema), async (c) => {
    const projectId = parseInt(c.req.param('projectId'));
    const collectionName = c.req.param('collectionName');
    const { indexName, fields, unique } = c.req.valid('json');
    try {
        const fullIndexName = await collectionService.createIndex(projectId, collectionName, indexName, fields, !!unique);
        return c.json({ message: `Index ${fullIndexName} created` });
    }
    catch (e) {
        return c.json({ error: 'Failed to create index', details: String(e) }, 500);
    }
});
// Delete Index
app.delete('/:collectionName/indexes/:indexName', async (c) => {
    const projectId = parseInt(c.req.param('projectId'));
    const collectionName = c.req.param('collectionName');
    const indexName = c.req.param('indexName');
    try {
        const fullIndexName = await collectionService.removeIndex(projectId, collectionName, indexName);
        return c.json({ message: `Index ${fullIndexName} deleted` });
    }
    catch (e) {
        return c.json({ error: 'Failed to delete index', details: String(e) }, 500);
    }
});
export default app;
