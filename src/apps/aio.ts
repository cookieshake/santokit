import { Hono } from 'hono'
import adminApp from './admin.js'
import clientApp from './client.js'

const app = new Hono()

// Mount both apps
app.route('/', adminApp)
app.route('/', clientApp)

export default app
