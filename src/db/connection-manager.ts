import { Kysely, PostgresDialect, sql } from 'kysely'
import pg from 'pg'
import { db as adminDb } from '@/db/index.js'
import type { Database } from '@/db/db-types.js'

const { Pool } = pg

// Singleton to hold active pools
class ConnectionManager {
    private instances: Map<string, Kysely<any>> = new Map()
    private pools: Map<string, pg.Pool> = new Map()

    async getConnection(databaseId: number): Promise<Kysely<any> | null> {
        // 1. Check if we already have an instance
        const key = String(databaseId)
        if (this.instances.has(key)) {
            return this.instances.get(key)!
        }

        // 2. Fetch config from Admin DB
        const database = await adminDb
            .selectFrom('databases')
            .selectAll()
            .where('id', '=', databaseId)
            .executeTakeFirst()

        if (!database) return null

        // 3. Validate connection string
        if (!database.connection_string.startsWith('postgres://') &&
            !database.connection_string.startsWith('postgresql://')) {
            throw new Error(`Invalid connection string for database "${database.name}". Only PostgreSQL connections are supported.`)
        }

        // 4. Create new pool
        const pool = new Pool({
            connectionString: database.connection_string
        })

        const dbInstance = new Kysely<any>({
            dialect: new PostgresDialect({ pool }),
        })

        this.pools.set(key, pool)
        this.instances.set(key, dbInstance)
        return dbInstance
    }

    // Optional: method to close specific pool or all
    async close(databaseId: number) {
        const key = String(databaseId)
        const instance = this.instances.get(key)
        if (instance) {
            await instance.destroy()
            this.instances.delete(key)
        }
        const pool = this.pools.get(key)
        if (pool) {
            await pool.end()
            this.pools.delete(key)
        }
    }
}

export const connectionManager = new ConnectionManager()
