import { sql } from 'kysely'
import { collectionRepository } from '@/modules/collection/collection.repository.js'
import { projectRepository } from '@/modules/project/project.repository.js'
import { connectionManager } from '@/db/connection-manager.js'

export const accountRepository = {
    // Helper to get DB and Table Name
    async getContext(projectId: number) {
        const databases = await projectRepository.findDatabasesByProjectId(projectId)
        if (databases.length === 0) throw new Error(`No databases found for project ${projectId}`)
        const database = databases[0]
        const databaseId = database.id

        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect to database')

        const collectionsList = await collectionRepository.list(databaseId)
        const authTable = collectionsList.find(t => t.type === 'auth')

        if (!authTable) {
            throw new Error(`No account/auth collection found for project ${projectId}`)
        }

        return { db: targetDb, tableName: `"${authTable.physical_name}"` }
    },

    create: async (projectId: number, data: any) => {
        const { db, tableName } = await accountRepository.getContext(projectId)

        const fullData = {
            id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).substring(2),
            name: data.email, // default name

            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...data
        }
        const keys = Object.keys(fullData)
        const cols = keys.map(k => `"${k}"`).join(', ')
        const vals = keys.map(k => {
            const v = (fullData as any)[k]
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
            if (Array.isArray(v)) {
                // Determine if it's a string array or object array? 
                // Roles is usually string array.
                const arrVals = v.map(item => typeof item === 'string' ? `"${item.replace(/"/g, '\\"')}"` : item).join(',')
                return `'${"{" + arrVals + "}"}'`
            }
            return v
        }).join(', ')

        const query = `INSERT INTO ${tableName} (${cols}) VALUES (${vals}) RETURNING *`
        const result = await sql.raw(query).execute(db)
        return result.rows[0]
    },

    findByProjectId: async (projectId: number) => {
        const { db, tableName } = await accountRepository.getContext(projectId)
        const result = await sql.raw(`SELECT * FROM ${tableName}`).execute(db)
        return result.rows
    },

    findById: async (projectId: number, id: number | string) => {
        const { db, tableName } = await accountRepository.getContext(projectId)
        const val = typeof id === 'string' ? `'${id.replace(/'/g, "''")}'` : id
        const result = await sql.raw(`SELECT * FROM ${tableName} WHERE id = ${val}`).execute(db)
        return result.rows[0]
    },

    findByEmail: async (projectId: number, email: string) => {
        const { db, tableName } = await accountRepository.getContext(projectId)
        const result = await sql.raw(`SELECT * FROM ${tableName} WHERE email = '${email.replace(/'/g, "''")}'`).execute(db)
        return result.rows[0]
    },

    delete: async (projectId: number, id: number | string) => {
        const { db, tableName } = await accountRepository.getContext(projectId)
        const val = typeof id === 'string' ? `'${id.replace(/'/g, "''")}'` : id
        await sql.raw(`DELETE FROM ${tableName} WHERE id = ${val}`).execute(db)
    }
}
