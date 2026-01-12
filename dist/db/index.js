import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.js';
// In a real app, use environment variables!
const connectionString = process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/santoki_db';
const pool = new Pool({
    connectionString,
});
export const db = drizzle(pool, { schema });
