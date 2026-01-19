import type { DbAdapter } from './db-adapter.js'
import { PostgresAdapter } from './postgres-adapter.js'
import { SqliteAdapter } from './sqlite-adapter.js'

export function createAdapter(connectionString: string): DbAdapter {
    if (connectionString.startsWith('postgres://') || connectionString.startsWith('postgresql://')) {
        return new PostgresAdapter()
    }

    if (connectionString.startsWith('sqlite://') ||
        connectionString.startsWith('file:') ||
        connectionString.endsWith('.db') ||
        connectionString.endsWith('.sqlite') ||
        connectionString.endsWith('.sqlite3')) {
        return new SqliteAdapter()
    }

    // Default to PostgreSQL for backward compatibility
    return new PostgresAdapter()
}

export type { DbAdapter, IdType } from './db-adapter.js'
export { PostgresAdapter } from './postgres-adapter.js'
export { SqliteAdapter } from './sqlite-adapter.js'
