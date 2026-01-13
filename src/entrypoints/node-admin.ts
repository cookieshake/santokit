import { serve } from '@hono/node-server'
import adminApp from '@/apps/admin.js'
import { config } from '@/config/index.js'
import { ensureAdminExists } from '@/lib/initial-setup.js'

// Run initial setup
await ensureAdminExists();

serve({
    fetch: adminApp.fetch,
    port: config.server.port,
}, (info) => {
    console.log(`Admin API is running on http://localhost:${info.port}`)
})
