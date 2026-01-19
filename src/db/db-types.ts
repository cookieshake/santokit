import type { Generated, Insertable, Selectable, Updateable, ColumnType } from 'kysely'

// Projects table
export interface ProjectsTable {
  id: string
  name: string
  created_at: ColumnType<Date | null, never, never>
}

// Databases table
export interface DatabasesTable {
  id: string
  project_id: string | null
  name: string
  connection_string: string
  prefix: ColumnType<string, string | undefined, string>
  created_at: ColumnType<Date | null, never, never>
}

// Accounts table
export interface AccountsTable {
  id: string
  name: string | null
  email: string
  password: string
  roles: string[] | null
  project_id: string | null
  created_at: ColumnType<Date | null, never, never>
  updated_at: ColumnType<Date | null, never, never>
}

// Policies table
export interface PoliciesTable {
  id: string
  project_id: string | null
  database_id: string | null
  collection_name: string
  role: string
  action: string
  condition: string
  effect: ColumnType<string, string | undefined, string>
  created_at: ColumnType<Date | null, never, never>
}

// Collections table
export interface CollectionsTable {
  id: string
  project_id: string | null
  database_id: string | null
  name: string
  physical_name: string
  type: ColumnType<string, string | undefined, string>
  created_at: ColumnType<Date | null, never, never>
  updated_at: ColumnType<Date | null, never, never>
}

// Main database interface
export interface Database {
  projects: ProjectsTable
  databases: DatabasesTable
  accounts: AccountsTable
  policies: PoliciesTable
  collections: CollectionsTable
}

// Type helpers for inserts/selects
export type Project = Selectable<ProjectsTable>
export type NewProject = Insertable<ProjectsTable>
export type ProjectUpdate = Updateable<ProjectsTable>

export type DatabaseRecord = Selectable<DatabasesTable>
export type NewDatabaseRecord = Insertable<DatabasesTable>
export type DatabaseRecordUpdate = Updateable<DatabasesTable>

export type Account = Selectable<AccountsTable>
export type NewAccount = Insertable<AccountsTable>
export type AccountUpdate = Updateable<AccountsTable>

export type Policy = Selectable<PoliciesTable>
export type NewPolicy = Insertable<PoliciesTable>
export type PolicyUpdate = Updateable<PoliciesTable>

export type Collection = Selectable<CollectionsTable>
export type NewCollection = Insertable<CollectionsTable>
export type CollectionUpdate = Updateable<CollectionsTable>
