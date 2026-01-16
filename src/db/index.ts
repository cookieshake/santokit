import * as schema from '@/db/schema.js';
import { config } from '@/config/index.js';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export type Database = NodePgDatabase<typeof schema>;

const { Pool } = pg;

if (!config.db.url) {
    throw new Error('DATABASE_URL environment variable is required');
}

const pool = new Pool({
    connectionString: config.db.url,
});

export const db = drizzle(pool, { schema });
