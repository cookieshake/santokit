import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from '@/db/schema.js'
import { pushSchema } from 'drizzle-kit/api'
import { sql } from 'drizzle-orm'

let globalContainer: StartedPostgreSqlContainer | null = null
let globalPool: Pool | null = null

export async function createTestDb() {
    // Reuse the same container for all tests to improve performance
    if (!globalContainer) {
        globalContainer = await new PostgreSqlContainer('postgres:16-alpine')
            .withReuse()
            .start()
    }

    // Create a new pool for this test
    const pool = new Pool({
        connectionString: globalContainer.getConnectionUri(),
    })

    const db = drizzle(pool, { schema })

    // Initialize schema programmatically
    const { apply } = await pushSchema(schema, db as any);
    await apply();

    // Create accounts table manually since it's removed from schema
    const { ACCOUNTS_TABLE_SQL } = await import('../modules/account/account-schema.js')
    await db.execute(sql.raw(ACCOUNTS_TABLE_SQL))

    return { db, pool }
}

export async function closeTestDb(pool: Pool) {
    await pool.end()
}

export async function stopGlobalContainer() {
    if (globalPool) {
        await globalPool.end()
        globalPool = null
    }
    if (globalContainer) {
        await globalContainer.stop()
        globalContainer = null
    }
}
