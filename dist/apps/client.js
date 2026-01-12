import { Hono } from 'hono';
import { jwt } from 'hono/jwt';
import dataController from '../modules/data/data.controller.js';
const app = new Hono().basePath('/v1');
const JWT_SECRET = process.env.JWT_SECRET || 'secret';
app.use('/*', jwt({ secret: JWT_SECRET }));
app.get('/', (c) => c.text('Client API (Modular Architecture)'));
// Mount Data Module
// Route: /data/:projectId/:collectionName  (Note: I'll mount it at /data for clarity)
app.route('/data/:projectId/:collectionName', dataController);
export default app;
