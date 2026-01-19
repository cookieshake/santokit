import type { Kysely } from 'kysely'

import { type DbAdapter } from '@/db/adapters/db-adapter.js'
import { PostgresAdapter } from '@/db/adapters/postgres-adapter.js'
import { connectionManager } from '@/db/connection-manager.js'

const defaultAdapter = new PostgresAdapter()

export async function withDbConnection<T>(
  databaseId: string,
  fn: (db: Kysely<any>, adapter: DbAdapter) => Promise<T>,
): Promise<T> {
  const db = await connectionManager.getConnection(databaseId)
  if (!db) throw new Error('Could not connect to data source')

  const adapter = connectionManager.getAdapter(databaseId) || defaultAdapter
  return await fn(db, adapter)
}

export async function getDbConnection(databaseId: string) {
  const db = await connectionManager.getConnection(databaseId)
  if (!db) throw new Error('Could not connect to data source')

  const adapter = connectionManager.getAdapter(databaseId) || defaultAdapter
  return { db, adapter }
}
