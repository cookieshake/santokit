import { serve } from '@hono/node-server'
import clientApp from '@/apps/client.js'

const port = Number(process.env.PORT) || 3000

serve({
    fetch: clientApp.fetch,
    port,
}, (info) => {
    console.log(`Data API is running on http://localhost:${info.port}`)
})
