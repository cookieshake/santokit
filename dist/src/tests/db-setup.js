import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from '@/db/schema.js';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { sql } from 'drizzle-orm';
export async function createTestDb() {
    const pglite = new PGlite();
    const db = drizzle(pglite, { schema });
    // Initialize schema
    // Since we don't have migrations generated in the repo yet, 
    // we can use a trick: export the schema and run raw SQL or use sync tools if available.
    // For now, let's assume we can push schema.
    return { db, pglite };
}
