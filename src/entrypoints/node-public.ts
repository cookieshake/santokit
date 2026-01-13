import { serve } from '@hono/node-server'
import clientApp from '@/apps/client.js'
import { config } from '@/config/index.js'

serve({
    fetch: clientApp.fetch,
    port: config.server.port,
}, (info) => {
    console.log(`Public API is running on http://localhost:${info.port}`)
})
