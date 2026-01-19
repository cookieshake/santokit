import { Kysely, PostgresDialect, SqliteDialect } from 'kysely'
import pg from 'pg'
import Database from 'better-sqlite3'
import { db as adminDb } from '@/db/index.js'
import { createAdapter, type DbAdapter } from '@/db/adapters/index.js'

const { Pool } = pg

// Singleton to hold active pools
class ConnectionManager {
    private instances: Map<string, Kysely<any>> = new Map()
    private pools: Map<string, pg.Pool> = new Map()
    private adapters: Map<string, DbAdapter> = new Map()

    async getConnection(databaseId: string): Promise<Kysely<any> | null> {
        // 1. Check if we already have an instance
        const key = databaseId
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

        const connectionString = database.connection_string

        // 3. Create adapter based on connection string
        const adapter = createAdapter(connectionString)
        this.adapters.set(key, adapter)

        // 4. Create appropriate dialect
        let dbInstance: Kysely<any>

        if (adapter.dialect === 'postgres') {
            if (!connectionString.startsWith('postgres://') && !connectionString.startsWith('postgresql://')) {
                throw new Error(`Invalid connection string for database "${database.name}". Expected PostgreSQL connection.`)
            }
            const pool = new Pool({ connectionString })
            this.pools.set(key, pool)
            dbInstance = new Kysely<any>({
                dialect: new PostgresDialect({ pool }),
            })
        } else if (adapter.dialect === 'sqlite') {
            const dbPath = connectionString.replace(/^(sqlite:\/\/|file:)/, '')
            const sqliteDb = new Database(dbPath)
            dbInstance = new Kysely<any>({
                dialect: new SqliteDialect({ database: sqliteDb }),
            })
        } else {
            throw new Error(`Unsupported database dialect: ${adapter.dialect}`)
        }

        this.instances.set(key, dbInstance)
        return dbInstance
    }

    getAdapter(databaseId: string): DbAdapter | null {
        return this.adapters.get(databaseId) || null
    }

    // Optional: method to close specific pool or all
    async close(databaseId: string) {
        const key = databaseId
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
        this.adapters.delete(key)
    }
}

export const connectionManager = new ConnectionManager()

