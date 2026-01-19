import { collectionRepository } from '@/modules/collection/collection.repository.js'
import { databaseRepository } from '@/modules/database/database.repository.js'
import { connectionManager } from '@/db/connection-manager.js'
import { db as mainDb } from '@/db/index.js'
import { typeid } from 'typeid-js'
import type { Kysely } from 'kysely'

export const accountRepository = {
    // Helper to get DB and Table Name
    getDatabaseId: async (projectId: string): Promise<string> => {

        const databases = await databaseRepository.findByProjectId(projectId)
        if (databases.length === 0) throw new Error(`No databases found for project ${projectId}`)
        const database = databases[0]
        return database.id
    },

    getContext: async (projectId: string | null): Promise<{ db: Kysely<any>, tableName: string }> => {
        if (!projectId) {
            // Global Account (System Admin)
            return { db: mainDb, tableName: 'accounts' }
        }

        const databaseId = await accountRepository.getDatabaseId(projectId)

        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect to database')

        const collectionsList = await collectionRepository.list(databaseId)
        const authTable = collectionsList.find(t => t.type === 'auth')

        if (!authTable) {
            throw new Error(`No account/auth collection found for project ${projectId}`)
        }

        return { db: targetDb, tableName: authTable.physical_name }
    },

    create: async (projectId: string | null, data: any) => {
        const { db, tableName } = await accountRepository.getContext(projectId)

        // Ensure ID is generated if not provided
        const fullData = {
            id: data.id || typeid(projectId ? 'usr' : 'sys').toString(),
            name: data.email, // default name
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...data
        }

        // SQLite array compatibility removed
        // Postgres handles arrays natively


        const result = await db
            .insertInto(tableName as any)
            .values(fullData)
            .returningAll()
            .executeTakeFirst()
        return result
    },

    findByProjectId: async (projectId: string | null) => {
        const { db, tableName } = await accountRepository.getContext(projectId)
        const result = await db
            .selectFrom(tableName as any)
            .selectAll()
            .execute()
        return result
    },

    findById: async (projectId: string | null, id: string) => {
        const { db, tableName } = await accountRepository.getContext(projectId)
        const result = await db
            .selectFrom(tableName as any)
            .selectAll()
            .where('id' as any, '=', id)
            .executeTakeFirst()
        return result
    },

    findByEmail: async (projectId: string | null, email: string) => {
        const { db, tableName } = await accountRepository.getContext(projectId)
        const result = await db
            .selectFrom(tableName as any)
            .selectAll()
            .where('email' as any, '=', email)
            .executeTakeFirst()
        return result
    },

    delete: async (projectId: string | null, id: string) => {
        const { db, tableName } = await accountRepository.getContext(projectId)
        await db
            .deleteFrom(tableName as any)
            .where('id' as any, '=', id)
            .execute()
    }
}

