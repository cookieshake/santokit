import { serve } from '@hono/node-server';
import clientApp from '@/apps/client.js';
import adminApp from '@/apps/admin.js';
// Client API on Port 3000
serve({
    fetch: clientApp.fetch,
    port: 3000,
}, (info) => {
    console.log(`Client API is running on http://localhost:${info.port}`);
});
// Admin API on Port 3001
serve({
    fetch: adminApp.fetch,
    port: 3001,
}, (info) => {
    console.log(`Admin API is running on http://localhost:${info.port}`);
});
