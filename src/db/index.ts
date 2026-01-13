import * as schema from '@/db/schema.js';
import { config } from '@/config/index.js';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgliteDatabase } from 'drizzle-orm/pglite';

export type Database = NodePgDatabase<typeof schema> | PgliteDatabase<typeof schema>;

export const db = await (async () => {
    if (config.db.url) {
        const { drizzle } = await import('drizzle-orm/node-postgres');
        const { Pool } = await import('pg');
        const pool = new Pool({
            connectionString: config.db.url,
        });
        return drizzle(pool, { schema }) as unknown as Database;
    } else {
        const { drizzle } = await import('drizzle-orm/pglite');
        const { PGlite } = await import('@electric-sql/pglite');
        const { pushSchema } = await import('drizzle-kit/api');

        const client = new PGlite();
        const db = drizzle(client, { schema }) as unknown as Database;

        // Push schema for PGLite (programmatic sync without migration files)
        const { apply } = await pushSchema(schema, db as any);
        await apply();

        return db;
    }
})();
