
import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { policyService } from './policy.service.js'
import { projectRepository } from '@/modules/project/project.repository.js'
import { CONSTANTS } from '@/constants.js'

const app = new Hono()

// Validations
const CreatePolicySchema = z.object({
    collection_name: z.string(),
    role: z.string(),
    action: z.enum(['create', 'read', 'update', 'delete']),
    condition: z.string().default('{}'), // JSON string
    effect: z.enum(['allow', 'deny']).default('allow')
})

// Helper to resolve Database
const resolveDatabaseId = async (c: any) => {
    const rawProjectId = c.req.header(CONSTANTS.HEADERS.PROJECT_ID)
    const databaseName = c.req.param('databaseName')

    if (!rawProjectId || !databaseName) {
        throw new Error('Missing project context or database name')
    }

    // System Project Logic - Policies usually for standard projects, but maybe system too?
    // Assuming standard projects for now.
    const projectId = parseInt(rawProjectId)
    if (isNaN(projectId)) throw new Error('Invalid Project ID')

    const database = await projectRepository.findDatabaseByName(projectId, databaseName)
    if (!database) throw new Error(`Database '${databaseName}' not found`)

    return { databaseId: database.id, projectId }
}

// List Policies
app.get('/', async (c) => {
    try {
        const { databaseId, projectId } = await resolveDatabaseId(c)
        const policies = await policyService.list(projectId, databaseId)
        return c.json(policies)
    } catch (e) {
        return c.json({ error: (e as Error).message }, 400)
    }
})

// Create Policy
app.post('/', zValidator('json', CreatePolicySchema), async (c) => {
    try {
        const { databaseId, projectId } = await resolveDatabaseId(c)
        const body = c.req.valid('json')

        const policy = await policyService.create({
            ...body,
            database_id: databaseId,
            project_id: projectId
        })
        return c.json(policy)
    } catch (e) {
        return c.json({ error: (e as Error).message }, 400)
    }
})

// Delete Policy
app.delete('/:id', async (c) => {
    try {
        const id = parseInt(c.req.param('id'))
        await policyService.delete(id)
        return c.json({ success: true })
    } catch (e) {
        return c.json({ error: (e as Error).message }, 400)
    }
})

export default app
