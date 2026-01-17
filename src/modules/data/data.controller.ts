import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { DynamicDataInsertSchema } from '@/validators.js'
import { dataService } from '@/modules/data/data.service.js'
import { policyService } from '@/modules/policy/policy.service.js'
import { projectRepository } from '@/modules/project/project.repository.js'
import { CONSTANTS } from '@/constants.js'

const app = new Hono()

// Helper to resolve Database
const resolveDatabaseId = async (c: any) => {
    // Project ID from Header
    const rawProjectId = c.req.header(CONSTANTS.HEADERS.PROJECT_ID)
    // Database Name from Param
    const databaseName = c.req.param('databaseName')

    if (!rawProjectId || !databaseName) {
        throw new Error('Missing project context or database name')
    }

    // System Project Logic
    if (rawProjectId === CONSTANTS.PROJECTS.SYSTEM_ID) {
        return 0; // Dummy
    }

    const projectId = parseInt(rawProjectId)
    const database = await projectRepository.findDatabaseByName(projectId, databaseName)
    if (!database) throw new Error(`Database '${databaseName}' not found`)
    return database.id
}

// Mounted at /projects/:projectId/databases/:databaseName/collections/:collectionName/records
// Actually path in app.ts is: /databases/:databaseName/collections/:collectionName/records
// header x-project-id is used.

// Helper to get user
const getUser = (c: any) => {
    return c.get('account') || { roles: ['guest'] }; // Default to guest if not found (public access?)
}

app.get('/', async (c) => {
    try {
        const rawProjectId = c.req.header(CONSTANTS.HEADERS.PROJECT_ID)!
        const collectionName = c.req.param('collectionName')!

        if (rawProjectId === CONSTANTS.PROJECTS.SYSTEM_ID) {
            const data = await dataService.system.findAll(collectionName)
            return c.json(data)
        } else {
            const databaseId = await resolveDatabaseId(c)
            const projectId = parseInt(rawProjectId)
            const user = getUser(c)

            const policy = await policyService.evaluate(projectId, databaseId, collectionName, 'read', user)
            if (!policy.allowed) return c.json({ error: 'Access Denied' }, 403)

            const data = await dataService.findAll(databaseId, collectionName, policy.filter)
            return c.json(data)
        }
    } catch (e) {
        return c.json({ error: (e as Error).message }, 400)
    }
})

app.post('/', zValidator('json', DynamicDataInsertSchema), async (c) => {
    try {
        const rawProjectId = c.req.header(CONSTANTS.HEADERS.PROJECT_ID)!
        const collectionName = c.req.param('collectionName')!
        const body = c.req.valid('json')

        if (rawProjectId === CONSTANTS.PROJECTS.SYSTEM_ID) {
            const result = await dataService.system.create(collectionName, body)
            return c.json(result)
        } else {
            const databaseId = await resolveDatabaseId(c)
            const projectId = parseInt(rawProjectId)
            const user = getUser(c)

            const policy = await policyService.evaluate(projectId, databaseId, collectionName, 'create', user)
            if (!policy.allowed) return c.json({ error: 'Access Denied' }, 403)

            // Note: We are not enforcing policy.filter on create payload for now, assuming "allowed" is enough.
            // Advanced implementation would check if body matches the condition.

            const result = await dataService.create(databaseId, collectionName, body)
            return c.json(result)
        }
    } catch (e) {
        return c.json({ error: (e as Error).message }, 400)
    }
})

app.patch('/:id', zValidator('json', DynamicDataInsertSchema), async (c) => {
    try {
        const rawProjectId = c.req.header(CONSTANTS.HEADERS.PROJECT_ID)!
        const collectionName = c.req.param('collectionName')!
        const id = c.req.param('id')
        const body = c.req.valid('json')

        if (rawProjectId === CONSTANTS.PROJECTS.SYSTEM_ID) {
            const result = await dataService.system.update(collectionName, id, body)
            return c.json(result)
        } else {
            const databaseId = await resolveDatabaseId(c)
            const projectId = parseInt(rawProjectId)
            const user = getUser(c)

            const policy = await policyService.evaluate(projectId, databaseId, collectionName, 'update', user)
            if (!policy.allowed) return c.json({ error: 'Access Denied' }, 403)

            const result = await dataService.update(databaseId, collectionName, id, body, policy.filter)
            if (!result) return c.json({ error: 'Not found or permission denied' }, 404) // Or 403?
            return c.json(result)
        }
    } catch (e) {
        return c.json({ error: (e as Error).message }, 400)
    }
})

app.delete('/:id', async (c) => {
    try {
        const rawProjectId = c.req.header(CONSTANTS.HEADERS.PROJECT_ID)!
        const collectionName = c.req.param('collectionName')!
        const id = c.req.param('id')

        if (rawProjectId === CONSTANTS.PROJECTS.SYSTEM_ID) {
            const result = await dataService.system.delete(collectionName, id)
            return c.json(result)
        } else {
            const databaseId = await resolveDatabaseId(c)
            const projectId = parseInt(rawProjectId)
            const user = getUser(c)

            const policy = await policyService.evaluate(projectId, databaseId, collectionName, 'delete', user)
            if (!policy.allowed) return c.json({ error: 'Access Denied' }, 403)

            const result = await dataService.delete(databaseId, collectionName, id, policy.filter)
            if (!result) return c.json({ error: 'Not found or permission denied' }, 404)
            return c.json(result)
        }
    } catch (e) {
        return c.json({ error: (e as Error).message }, 400)
    }
})

export default app
