import { Hono } from 'hono'
import { getAuthProject } from '@/lib/auth-project.js'
import { accountRepository } from './account.repository.js'

const app = new Hono()

// Mounted at /v1/auth/:projectId
// Mounted at /v1/auth
app.on(['POST', 'GET'], '/*', async (c) => {
    const rawId = c.req.header('x-project-id')
    if (!rawId) {
        return c.json({ error: "Missing Project ID Header (x-project-id)" }, 400);
    }
    const projectId = parseInt(rawId)
    if (isNaN(projectId)) {
        return c.json({ error: "Invalid Project ID Header" }, 400);
    }

    const db = await accountRepository.getDbForProject(projectId)
    const auth = getAuthProject(db)
    return auth.handler(c.req.raw)
})

export default app
