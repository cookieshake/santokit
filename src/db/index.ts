import { Kysely, PostgresDialect } from 'kysely'
import pg from 'pg'

import { config } from '@/config/index.js'

import type { Database } from './db-types.js'

const { Pool } = pg

if (!config.db.url) {
  throw new Error('DATABASE_URL environment variable is required')
}

const pool = new Pool({
  connectionString: config.db.url,
})

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool }),
})

export type { Database }
