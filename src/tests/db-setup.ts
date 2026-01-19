import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { Pool } from 'pg'
import type { Database as DatabaseType } from '@/db/db-types.js'

let globalContainer: StartedPostgreSqlContainer | null = null

// Always Postgres
const DB_TYPE = 'postgres'

export async function createTestDb() {
    let db: Kysely<DatabaseType>
    let pool: Pool | undefined

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

    await createSchema(db)

    return { db, pool }
}

export async function closeTestDb(pool?: Pool) {
    if (pool) {
        await pool.end()
    }
}

export async function stopGlobalContainer() {
    if (globalContainer) {
        await globalContainer.stop()
        globalContainer = null
    }
}

export function getTestConnectionString() {
    if (!globalContainer) throw new Error('Global container not started')
    return globalContainer.getConnectionUri()
}

// Helper to create schema using Kysely's schema builder
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
    await db.schema.createTable('accounts')
        .ifNotExists()
        .addColumn('id', 'text', (col) => col.primaryKey())
        .addColumn('name', 'text')
        .addColumn('email', 'text', (col) => col.notNull().unique())
        .addColumn('password', 'text', (col) => col.notNull())
        .addColumn('project_id', 'text')
        .addColumn('created_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
        .addColumn('updated_at', 'timestamp', (col) => col.defaultTo(sql`CURRENT_TIMESTAMP`))
        .addColumn('roles', sql`text[]`)
        .execute()


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
