import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Kysely, PostgresDialect, SqliteDialect, sql } from 'kysely'
import { Pool } from 'pg'
import Database from 'better-sqlite3'
import type { Database as DatabaseType } from '@/db/db-types.js'

let globalContainer: StartedPostgreSqlContainer | null = null

const DB_TYPE = process.env.TEST_DB_TYPE || 'postgres'

export async function createTestDb() {
    let db: Kysely<DatabaseType>
    let pool: Pool | undefined
    let sqliteDb: Database.Database | undefined

    if (DB_TYPE === 'postgres') {
        // reuse container
        if (!globalContainer) {
            globalContainer = await new PostgreSqlContainer('postgres:16-alpine')
                .start()
        }
        pool = new Pool({
            connectionString: globalContainer.getConnectionUri(),
        })
        db = new Kysely<DatabaseType>({
            dialect: new PostgresDialect({ pool }),
        })
    } else {
        // sqlite in-memory
        sqliteDb = new Database(':memory:')
        db = new Kysely<DatabaseType>({
            dialect: new SqliteDialect({ database: sqliteDb }),
        })
    }

    await createSchema(db)

    return { db, pool, sqliteDb }
}

export async function closeTestDb(pool?: Pool, sqliteDb?: Database.Database) {
    if (pool) {
        await pool.end()
    }
    if (sqliteDb) {
        sqliteDb.close()
    }
}

export async function stopGlobalContainer() {
    if (globalContainer) {
        await globalContainer.stop()
        globalContainer = null
    }
}

export function getTestConnectionString() {
    if (DB_TYPE === 'postgres') {
        if (!globalContainer) throw new Error('Global container not started')
        return globalContainer.getConnectionUri()
    }
    return 'sqlite://:memory:'
}

// Helper to create schema using Kysely's schema builder for dialect compatibility
export async function createSchema(db: Kysely<any>) {
    // Projects
    await db.schema.createTable('projects')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
        .execute()

    // Databases
    await db.schema.createTable('databases')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('project_id', 'text', (col) => col.references('projects.id').onDelete('cascade'))
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('connection_string', 'text', (col) => col.notNull())
        .addColumn('prefix', 'text', (col) => col.defaultTo('santoki_').notNull())
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
        .addUniqueConstraint('unique_project_db_name', ['project_id', 'name'])
        .execute()

    // Accounts
    let accountsTable = db.schema.createTable('accounts')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('name', 'text')
        .addColumn('email', 'text', (col) => col.notNull().unique())
        .addColumn('password', 'text', (col) => col.notNull())
        .addColumn('project_id', 'text')
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
        .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))

    if (DB_TYPE === 'postgres') {
        accountsTable = accountsTable.addColumn('roles', sql`text[]`)
    } else {
        // SQLite doesn't strictly support arrays, store as text (or json if we had plugin)
        // For simple tests, 'text' is often enough, but let's stick to what Kysely generates for 'text'
        // If the app expects arrays, we might need value transformation middleware or JSON wrapper.
        // For now, assuming simply creating column is strict enough for schema existence.
        accountsTable = accountsTable.addColumn('roles', 'text')
    }
    await accountsTable.execute()


    // Policies
    await db.schema.createTable('policies')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('project_id', 'text', (col) => col.references('projects.id').onDelete('cascade'))
        .addColumn('database_id', 'text', (col) => col.references('databases.id').onDelete('cascade'))
        .addColumn('collection_name', 'text', (col) => col.notNull())
        .addColumn('role', 'text', (col) => col.notNull())
        .addColumn('action', 'text', (col) => col.notNull())
        .addColumn('condition', 'text', (col) => col.notNull())
        .addColumn('effect', 'text', (col) => col.defaultTo('allow').notNull())
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
        .execute()

    // Collections
    await db.schema.createTable('collections')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('project_id', 'text', (col) => col.references('projects.id').onDelete('cascade'))
        .addColumn('database_id', 'text', (col) => col.references('databases.id').onDelete('cascade'))
        .addColumn('name', 'text', (col) => col.notNull())
        .addColumn('physical_name', 'text', (col) => col.notNull().unique())
        .addColumn('type', 'text', (col) => col.defaultTo('base').notNull())
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
        .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
        .execute()
}

export async function applySchema(db: Kysely<any>) {
    await createSchema(db)
}
