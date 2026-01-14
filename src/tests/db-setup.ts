import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '@/db/schema.js'
import { pushSchema } from 'drizzle-kit/api'

export async function createTestDb() {
    const pglite = new PGlite()
    const db = drizzle(pglite, { schema })

    // Initialize schema programmatically
    const { apply } = await pushSchema(schema, db as any);
    await apply();

    return { db, pglite }
}
