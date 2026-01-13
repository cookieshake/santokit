import { serve } from '@hono/node-server'
import aioApp from '@/apps/aio.js'

const port = Number(process.env.PORT) || 3000

serve({
    fetch: aioApp.fetch,
    port,
}, (info) => {
    console.log(`AIO API is running on http://localhost:${info.port}`)
})
