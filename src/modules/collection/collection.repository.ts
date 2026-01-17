import { sql, Kysely } from 'kysely'
import { previewSql, previewRawSql } from './sql-preview.js'
import { connectionManager } from '@/db/connection-manager.js'
import { db } from '@/db/index.js'

export const collectionRepository = {
    // Metadata Operations (Main DB)
    list: async (databaseId: number) => {
        return await db
            .selectFrom('collections')
            .selectAll()
            .where('database_id', '=', databaseId)
            .execute()
    },

    findByName: async (databaseId: number, name: string) => {
        return await db
            .selectFrom('collections')
            .selectAll()
            .where('database_id', '=', databaseId)
            .where('name', '=', name)
            .executeTakeFirst()
    },

    createMetadata: async (projectId: number, databaseId: number, name: string, physicalName: string, type: 'base' | 'auth' = 'base') => {
        return await db
            .insertInto('collections')
            .values({
                project_id: projectId,
                database_id: databaseId,
                name,
                physical_name: physicalName,
                type
            })
            .returningAll()
            .execute()
    },

    deleteMetadata: async (databaseId: number, physicalName: string) => {
        await db
            .deleteFrom('collections')
            .where('database_id', '=', databaseId)
            .where('physical_name', '=', physicalName)
            .execute()
    },

    // Physical Table Operations (Tenant DB)
    checkPhysicalTableExists: async (databaseId: number, physicalName: string) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) return false

        const result = await sql`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = ${physicalName}
            )
        `.execute(targetDb)

        return (result.rows[0] as any).exists === true
    },

    createPhysicalTable: async (databaseId: number, physicalName: string, idType: 'serial' | 'uuid' = 'serial', dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect to data source')

        const idCol = idType === 'uuid'
            ? 'id UUID PRIMARY KEY DEFAULT gen_random_uuid()'
            : 'id SERIAL PRIMARY KEY'

        const rawSql = `CREATE TABLE "${physicalName}" (${idCol}, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`

        if (dryRun) {
            return previewRawSql(rawSql)
        }

        await sql.raw(rawSql).execute(targetDb)
    },

    deletePhysicalTable: async (databaseId: number, physicalName: string, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect to data source')

        const rawSql = `DROP TABLE IF EXISTS "${physicalName}"`

        if (dryRun) {
            return previewRawSql(rawSql)
        }

        await sql.raw(rawSql).execute(targetDb)
    },

    // Field Operations
    getFields: async (databaseId: number, physicalName: string) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        const result = await sql`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = ${physicalName}
        `.execute(targetDb)

        return result.rows
    },

    addField: async (databaseId: number, physicalName: string, fieldName: string, type: string, isNullable: boolean, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        let sqlType = 'TEXT'
        if (type === 'integer') sqlType = 'INTEGER'
        if (type === 'boolean') sqlType = 'BOOLEAN'
        const sqlNullable = isNullable ? 'NULL' : 'NOT NULL'

        const rawSql = `ALTER TABLE "${physicalName}" ADD COLUMN "${fieldName}" ${sqlType} ${sqlNullable}`

        if (dryRun) return previewRawSql(rawSql)

        await sql.raw(rawSql).execute(targetDb)
    },

    removeField: async (databaseId: number, physicalName: string, fieldName: string, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        const rawSql = `ALTER TABLE "${physicalName}" DROP COLUMN "${fieldName}"`
        if (dryRun) return previewRawSql(rawSql)

        await sql.raw(rawSql).execute(targetDb)
    },

    renameField: async (databaseId: number, physicalName: string, oldName: string, newName: string, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        const rawSql = `ALTER TABLE "${physicalName}" RENAME COLUMN "${oldName}" TO "${newName}"`
        if (dryRun) return previewRawSql(rawSql)

        await sql.raw(rawSql).execute(targetDb)
    },

    // Index Operations
    getIndexes: async (dataSourceId: number, physicalName: string) => {
        const targetDb = await connectionManager.getConnection(dataSourceId)
        if (!targetDb) throw new Error('Could not connect')

        const result = await sql`
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = ${physicalName}
        `.execute(targetDb)

        return result.rows
    },

    createIndex: async (dataSourceId: number, physicalName: string, indexName: string, columns: string[], unique: boolean, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(dataSourceId)
        if (!targetDb) throw new Error('Could not connect')

        const uniqueStr = unique ? 'UNIQUE ' : ''
        const colsStr = columns.map(c => `"${c}"`).join(', ')

        const rawSql = `CREATE ${uniqueStr}INDEX "${indexName}" ON "${physicalName}" (${colsStr})`

        if (dryRun) return previewRawSql(rawSql)

        await sql.raw(rawSql).execute(targetDb)
    },

    removeIndex: async (dataSourceId: number, indexName: string, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(dataSourceId)
        if (!targetDb) throw new Error('Could not connect')

        const rawSql = `DROP INDEX "${indexName}"`
        if (dryRun) return previewRawSql(rawSql)

        await sql.raw(rawSql).execute(targetDb)
    }
}
