import { Hono } from 'hono'
import { getAuthProject } from '@/lib/auth-project.js'
import { userRepository } from './user.repository.js'

const app = new Hono()

// Mounted at /v1/auth/:projectId
app.on(['POST', 'GET'], '/*', async (c) => {
    const projectId = parseInt(c.req.param('projectId')!)
    const db = await userRepository.getDbForProject(projectId)
    const auth = getAuthProject(db)
    return auth.handler(c.req.raw)
})

export default app
