import { serve } from '@hono/node-server'
import adminApp from '@/apps/admin.js'

const port = Number(process.env.PORT) || 3001

serve({
    fetch: adminApp.fetch,
    port,
}, (info) => {
    console.log(`Admin API is running on http://localhost:${info.port}`)
})
