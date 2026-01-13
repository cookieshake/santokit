import { serve } from '@hono/node-server'
import aioApp from '@/apps/aio.js'
import { config } from '@/config/index.js'
import { ensureAdminExists } from '@/lib/initial-setup.js'

// Run initial setup
await ensureAdminExists();

serve({
    fetch: aioApp.fetch,
    port: config.server.port,
}, (info) => {
    console.log(`AIO API is running on http://localhost:${info.port}`)
})
