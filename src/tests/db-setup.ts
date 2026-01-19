import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Kysely, PostgresDialect, sql } from 'kysely'
import { Pool } from 'pg'
import type { Database } from '@/db/db-types.js'

let globalContainer: StartedPostgreSqlContainer | null = null

// SQL to create the schema (matches the Drizzle schema)
const SCHEMA_SQL = `
-- Projects
CREATE TABLE IF NOT EXISTS projects(
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Databases
CREATE TABLE IF NOT EXISTS databases(
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    connection_string TEXT NOT NULL,
    prefix TEXT NOT NULL DEFAULT 'santoki_',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, name)
);

-- Accounts
CREATE TABLE IF NOT EXISTS accounts(
    id TEXT PRIMARY KEY,
    name TEXT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    roles TEXT[],
    project_id TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Policies
CREATE TABLE IF NOT EXISTS policies(
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    database_id TEXT REFERENCES databases(id) ON DELETE CASCADE,
    collection_name TEXT NOT NULL,
    role TEXT NOT NULL,
    action TEXT NOT NULL,
    condition TEXT NOT NULL,
    effect TEXT NOT NULL DEFAULT 'allow',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Collections
CREATE TABLE IF NOT EXISTS collections(
    id TEXT PRIMARY KEY,
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    database_id TEXT REFERENCES databases(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    physical_name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 'base',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
`

export async function createTestDb() {
    // Reuse the same container for all tests to improve performance
    if (!globalContainer) {
        globalContainer = await new PostgreSqlContainer('postgres:16-alpine')
            //.withReuse() // Disable reuse to avoid schema conflict with existing data
            .start()
    }

    // Create a new pool for this test
    const pool = new Pool({
        connectionString: globalContainer.getConnectionUri(),
    })

    const db = new Kysely<Database>({
        dialect: new PostgresDialect({ pool }),
    })

    // Initialize schema
    await sql.raw(SCHEMA_SQL).execute(db)

    return { db, pool }
}

export async function closeTestDb(pool: Pool) {
    await pool.end()
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

export async function applySchema(db: Kysely<any>) {
    await sql.raw(SCHEMA_SQL).execute(db)
}
