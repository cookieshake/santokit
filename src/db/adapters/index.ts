import type { DbAdapter } from './db-adapter.js'
import { PostgresAdapter } from './postgres-adapter.js'

export function createAdapter(connectionString: string): DbAdapter {
  if (connectionString.startsWith('postgres://') || connectionString.startsWith('postgresql://')) {
    return new PostgresAdapter()
  }

  // Default to PostgreSQL for backward compatibility but log warning or throw if clearly not postgres?
  // For now, retaining default behavior but assuming Postgres.
  return new PostgresAdapter()
}

export type { DbAdapter, IdType } from './db-adapter.js'
export { PostgresAdapter } from './postgres-adapter.js'
