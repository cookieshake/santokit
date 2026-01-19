import { promises as fs } from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

import { Kysely, Migrator, PostgresDialect, FileMigrationProvider } from 'kysely'
import { Pool } from 'pg'

import { config } from '../config/index.js'

import type { Database as DatabaseType } from './db-types.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function migrateToLatest() {
  // Ensure DATABASE_URL is present
  if (!config.db.url) {
    console.error('DATABASE_URL environment variable is required')
    process.exit(1)
  }

  // Determine dialect based on URL protocol
  // If it starts with 'postgres' (postgres:// or postgresql://), use Postgres.
  const isPostgres = config.db.url.startsWith('postgres')

  if (!isPostgres) {
    console.error(`Invalid connection string for database. Expected PostgreSQL connection.`)
    process.exit(1)
  }

  let db: Kysely<DatabaseType>

  console.log(`Using PostgreSQL dialect (URL: ${config.db.url})`)
  db = new Kysely<DatabaseType>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString: config.db.url,
      }),
    }),
  })

  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, 'migrations'),
    }),
  })

  const { error, results } = await migrator.migrateToLatest()

  results?.forEach((it) => {
    if (it.status === 'Success') {
      console.log(`migration "${it.migrationName}" was executed successfully`)
    } else if (it.status === 'Error') {
      console.error(`failed to execute migration "${it.migrationName}"`)
    }
  })

  if (error) {
    console.error('failed to migrate')
    console.error(error)
    process.exit(1)
  }

  await db.destroy()
  console.log('Migration completed successfully')
}

migrateToLatest()
