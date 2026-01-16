import { sql } from 'drizzle-orm'
import { db } from '@/db/index.js'
import { CONSTANTS } from '@/constants.js'
import { collectionRepository } from '@/modules/collection/collection.repository.js'
import { projectRepository } from '@/modules/project/project.repository.js'
import { connectionManager } from '@/db/connection-manager.js'

export const accountRepository = {
    // Helper to get DB and Table Name
    async getContext(projectId: number | string) {
        let numericId = 0
        let databaseId: number
        let prefix = ''

        if (projectId === CONSTANTS.PROJECTS.SYSTEM_ID) {
            const projects = await projectRepository.findAll()
            const sysProject = projects.find(p => p.name === CONSTANTS.PROJECTS.SYSTEM_ID)
            if (!sysProject) throw new Error('System project not found')
            numericId = sysProject.id
        } else {
            numericId = Number(projectId)
        }

        const databases = await projectRepository.findDatabasesByProjectId(numericId)
        if (databases.length === 0) throw new Error(`No databases found for project ${projectId}`)
        const database = databases[0]
        databaseId = database.id
        prefix = database.prefix

        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect to database')

        const collectionTableName = `${prefix}p${numericId}__collections`.toLowerCase()
        const tables = await collectionRepository.listPhysicalTables(databaseId, collectionTableName, prefix, numericId)
        const authTable = tables.find(t => t.type === 'auth')

        if (!authTable) {
            throw new Error(`No account/auth collection found for project ${projectId}`)
        }

        return { db: targetDb, tableName: `"${authTable.physicalName}"` }
    },

    create: async (projectId: number | string, data: any) => {
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
        const result = await db.execute(sql.raw(query))
        return result.rows[0]
    },

    findByProjectId: async (projectId: number | string) => {
        const { db, tableName } = await accountRepository.getContext(projectId)
        const result = await db.execute(sql.raw(`SELECT * FROM ${tableName}`))
        return result.rows
    },

    findById: async (projectId: number | string, id: number | string) => {
        const { db, tableName } = await accountRepository.getContext(projectId)
        const val = typeof id === 'string' ? `'${id.replace(/'/g, "''")}'` : id
        const result = await db.execute(sql.raw(`SELECT * FROM ${tableName} WHERE id = ${val}`))
        return result.rows[0]
    },

    findByEmail: async (projectId: number | string, email: string) => {
        const { db, tableName } = await accountRepository.getContext(projectId)
        const result = await db.execute(sql.raw(`SELECT * FROM ${tableName} WHERE email = '${email.replace(/'/g, "''")}'`))
        return result.rows[0]
    },

    delete: async (projectId: number | string, id: number | string) => {
        const { db, tableName } = await accountRepository.getContext(projectId)
        const val = typeof id === 'string' ? `'${id.replace(/'/g, "''")}'` : id
        await db.execute(sql.raw(`DELETE FROM ${tableName} WHERE id = ${val}`))
    }
}
