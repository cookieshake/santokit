import { serve } from '@hono/node-server'

import app from '@/apps/app.js'
import { config } from '@/config/index.js'
import { ensureAdminExists } from '@/lib/initial-setup.js'

// Run initial setup (System Check)
await ensureAdminExists()

serve(
  {
    fetch: app.fetch,
    port: config.server.port,
  },
  (info) => {
    console.log(`Santoki Server is running on http://localhost:${info.port}`)
    console.log(`- API: http://localhost:${info.port}/v1`)
    console.log(`- UI:  http://localhost:${info.port}/ui`)
  },
)
