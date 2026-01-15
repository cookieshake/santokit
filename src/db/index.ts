import * as schema from '@/db/schema.js';
import { config } from '@/config/index.js';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export type Database = NodePgDatabase<typeof schema>;

let _db: Database | null = null;

async function initDb(): Promise<Database> {
    if (!config.db.url) {
        throw new Error('DATABASE_URL environment variable is required');
    }

    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { Pool } = await import('pg');
    const pool = new Pool({
        connectionString: config.db.url,
    });
    return drizzle(pool, { schema }) as unknown as Database;
}

export const db = new Proxy({} as Database, {
    get(_target, prop) {
        if (!_db) {
            _db = initDb() as any;
        }
        return (_db as any)[prop];
    }
});
