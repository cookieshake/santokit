import { Hono } from 'hono';
import clientApp from './apps/client.js';
import adminApp from './apps/admin.js';
// This is the "Combined" app for environments that don't support multiple ports (like Cloudflare Workers standard output)
// We mount Admin under /admin for convenience here.
const app = new Hono();
app.route('/admin', adminApp);
app.route('/', clientApp);
export default app;
