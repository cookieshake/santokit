import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { CreateAccountSchema } from '@/validators.js'
import { accountService } from './account.service.js'

const app = new Hono()

// POST /projects/:projectId/accounts/
app.post('/', zValidator('json', CreateAccountSchema), async (c) => {
    const projectId = Number(c.req.param('projectId'))
    const data = c.req.valid('json')
    try {
        const result = await accountService.createAccount(projectId, data)
        return c.json(result)
    } catch (e) {
        console.error(e)
        return c.json({ error: 'Failed to create account (Duplicate email in project?)' }, 400)
    }
})

// GET /projects/:projectId/accounts/
app.get('/', async (c) => {
    const projectId = Number(c.req.param('projectId'))
    const result = await accountService.listAccounts(projectId)
    return c.json(result)
})

// DELETE /projects/:projectId/accounts/:accountId
app.delete('/:accountId', async (c) => {
    const accountId = Number(c.req.param('accountId'))
    await accountService.deleteAccount(accountId)
    return c.json({ success: true })
})

export default app
