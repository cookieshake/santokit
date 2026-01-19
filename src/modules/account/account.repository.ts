import type { Kysely } from 'kysely'
import { typeid } from 'typeid-js'

import { db as mainDb } from '@/db/index.js'
import { getDbConnection } from '@/lib/db-helpers.js'
import { collectionRepository } from '@/modules/collection/collection.repository.js'
import { databaseRepository } from '@/modules/database/database.repository.js'

export const accountRepository = {
  // Helper to get DB and Table Name
  getDatabaseId: async (projectId: string): Promise<string> => {
    const databases = await databaseRepository.findByProjectId(projectId)
    if (databases.length === 0) throw new Error(`No databases found for project ${projectId}`)
    const database = databases[0]
    return database.id
  },

  getContext: async (
    projectId: string | null,
    collectionName: string,
  ): Promise<{ db: Kysely<any>; tableName: string }> => {
    if (!projectId) {
      // Global Account (System Admin)
      return { db: mainDb, tableName: 'accounts' }
    }

    const databaseId = await accountRepository.getDatabaseId(projectId)

    const { db: targetDb } = await getDbConnection(databaseId)

    const collectionsList = await collectionRepository.list(databaseId)
    // Find specific auth collection by name
    const authTable = collectionsList.find((t) => t.type === 'auth' && t.name === collectionName)

    if (!authTable) {
      throw new Error(`Auth collection '${collectionName}' not found for project ${projectId}`)
    }

    return { db: targetDb, tableName: authTable.physical_name }
  },

  create: async (
    projectId: string | null,
    data: Record<string, unknown>,
    collectionName: string,
  ) => {
    const { db, tableName } = await accountRepository.getContext(projectId, collectionName)

    // Ensure ID is generated if not provided
    const fullData = {
      id: (data.id as string) || typeid(projectId ? 'usr' : 'sys').toString(),
      name: data.email as string, // default name
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...data,
    }

    // SQLite array compatibility removed
    // Postgres handles arrays natively

    const result = await db.insertInto(tableName).values(fullData).returningAll().executeTakeFirst()
    return result
  },

  findByProjectId: async (projectId: string | null, collectionName: string) => {
    const { db, tableName } = await accountRepository.getContext(projectId, collectionName)
    const result = await db.selectFrom(tableName).selectAll().execute()
    return result
  },

  findById: async (projectId: string | null, id: string, collectionName: string) => {
    const { db, tableName } = await accountRepository.getContext(projectId, collectionName)
    const result = await db
      .selectFrom(tableName)
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst()
    return result
  },

  findByEmail: async (projectId: string | null, email: string, collectionName: string) => {
    const { db, tableName } = await accountRepository.getContext(projectId, collectionName)
    const result = await db
      .selectFrom(tableName)
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst()
    return result
  },

  delete: async (projectId: string | null, id: string, collectionName: string) => {
    const { db, tableName } = await accountRepository.getContext(projectId, collectionName)
    await db.deleteFrom(tableName).where('id', '=', id).execute()
  },
}
