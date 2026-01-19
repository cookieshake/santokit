import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // Databases table indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_databases_project_id ON databases(project_id)`.execute(
    db,
  )

  // Collections table indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_collections_database_id ON collections(database_id)`.execute(
    db,
  )
  await sql`CREATE INDEX IF NOT EXISTS idx_collections_database_name ON collections(database_id, name)`.execute(
    db,
  )

  // Policies table indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_policies_project_database ON policies(project_id, database_id)`.execute(
    db,
  )
  await sql`CREATE INDEX IF NOT EXISTS idx_policies_lookup ON policies(project_id, database_id, collection_name, action)`.execute(
    db,
  )
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop indexes in reverse order
  await sql`DROP INDEX IF EXISTS idx_policies_lookup`.execute(db)
  await sql`DROP INDEX IF EXISTS idx_policies_project_database`.execute(db)
  await sql`DROP INDEX IF EXISTS idx_collections_database_name`.execute(db)
  await sql`DROP INDEX IF EXISTS idx_collections_database_id`.execute(db)
  await sql`DROP INDEX IF EXISTS idx_databases_project_id`.execute(db)
}
