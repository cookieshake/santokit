import { collectionService } from '@/modules/collection/collection.service.js'
import { projectRepository } from '@/modules/project/project.repository.js'
import { projectService } from '@/modules/project/project.service.js'
import { connectionManager } from '@/db/connection-manager.js'
import { sql, eq } from 'drizzle-orm'
import { CONSTANTS } from '@/constants.js'
import { db } from '@/db/index.js'
// Removed projects, dataSources imports from here, used inside system handler
import { projects, accounts } from '@/db/schema.js' // accounts was in schema now? No, schema says accounts defined there.

// accounts definition in schema.ts:
// export const accounts = pgTable('accounts', { ... }) 

const SYSTEM_COLLECTIONS: Record<string, any> = {
    'projects': projects,
    'accounts': accounts
}

export const dataService = {
    // User Data Operations
    create: async (databaseId: number, collectionName: string, data: Record<string, any>) => {
        // 1. Resolve Meta
        const detail = await collectionService.getDetail(databaseId, collectionName)
        const physicalName = detail.meta.physicalName

        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        // 2. Dynamic Insert
        const keys = Object.keys(data)
        const values = Object.values(data)
        const cols = keys.map(k => `"${k}"`).join(', ')
        const valueString = values.map(v => {
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
            if (v === null || v === undefined) return 'NULL'
            return v
        }).join(', ')

        const query = `INSERT INTO "${physicalName}" (${cols}) VALUES (${valueString}) RETURNING id`
        const result = await targetDb.execute(sql.raw(query))
        return result.rows[0]
    },

    findAll: async (databaseId: number, collectionName: string) => {
        const detail = await collectionService.getDetail(databaseId, collectionName)
        const physicalName = detail.meta.physicalName

        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        const result = await targetDb.execute(sql.raw(`SELECT * FROM "${physicalName}"`))
        return result.rows
    },

    update: async (databaseId: number, collectionName: string, id: string | number, data: Record<string, any>) => {
        // TODO: Implement update for user data
        throw new Error("Update not implemented for user data")
    },

    delete: async (databaseId: number, collectionName: string, id: string | number) => {
        // TODO: Implement delete for user data
        throw new Error("Delete not implemented for user data")
    },

    // System Data Operations
    system: {
        create: async (collectionName: string, data: Record<string, any>) => {
            // Intercept Projects creation to use Service
            if (collectionName.toLowerCase() === 'projects') {
                const { name, connectionString, prefix } = data
                if (!name || !connectionString) throw new Error('Name and connectionString are required')
                return await projectService.create(name, connectionString, prefix)
            }

            const table = SYSTEM_COLLECTIONS[collectionName.toLowerCase()]
            if (!table) throw new Error(`System collection '${collectionName}' not found`)

            // @ts-ignore
            const result = await db.insert(table).values(data).returning() as any[];
            return result[0];
        },

        findAll: async (collectionName: string) => {
            const table = SYSTEM_COLLECTIONS[collectionName.toLowerCase()]
            if (!table) throw new Error(`System collection '${collectionName}' not found`)
            return await db.select().from(table)
        },

        update: async (collectionName: string, id: string | number, data: Record<string, any>) => {
            const table = SYSTEM_COLLECTIONS[collectionName.toLowerCase()]
            if (!table) throw new Error(`System collection '${collectionName}' not found`)

            // @ts-ignore
            const result = await db.update(table).set(data).where(eq(table.id, id)).returning() as any[];
            return result[0]
        },

        delete: async (collectionName: string, id: string | number) => {
            const table = SYSTEM_COLLECTIONS[collectionName.toLowerCase()]
            if (!table) throw new Error(`System collection '${collectionName}' not found`)

            // @ts-ignore
            const result = await db.delete(table).where(eq(table.id, id)).returning() as any[];
            return result[0]
        }
    }
}
