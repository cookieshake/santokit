import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import * as schema from '@/db/schema.js'
import { pushSchema } from 'drizzle-kit/api'
import { sql } from 'drizzle-orm'

export async function createTestDb() {
    const pglite = new PGlite()
    const db = drizzle(pglite, { schema })

    // Initialize schema programmatically
    const { apply } = await pushSchema(schema, db as any);
    await apply();

    // Create accounts table manually since it's removed from schema
    const { ACCOUNTS_TABLE_SQL } = await import('../modules/account/account-schema.js')
    await db.execute(sql.raw(ACCOUNTS_TABLE_SQL))

    return { db, pglite }
}
