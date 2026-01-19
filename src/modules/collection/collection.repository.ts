
import { previewRawSql } from './sql-preview.js'
import { connectionManager } from '@/db/connection-manager.js'
import { db } from '@/db/index.js'
import { PostgresAdapter } from '@/db/adapters/postgres-adapter.js'

// Default adapter for cases where we can't get adapter from connection manager
const defaultAdapter = new PostgresAdapter()

export const collectionRepository = {
    // Metadata Operations (Main DB)
    list: async (databaseId: string) => {
        return await db
            .selectFrom('collections')
            .selectAll()
            .where('database_id', '=', databaseId)
            .execute()
    },

    findByName: async (databaseId: string, name: string) => {
        return await db
            .selectFrom('collections')
            .selectAll()
            .where('database_id', '=', databaseId)
            .where('name', '=', name)
            .executeTakeFirst()
    },

    createMetadata: async (id: string, projectId: string, databaseId: string, name: string, physicalName: string, type: 'base' | 'auth' = 'base') => {
        return await db
            .insertInto('collections')
            .values({
                id,
                project_id: projectId,
                database_id: databaseId,
                name,
                physical_name: physicalName,
                type
            })
            .returningAll()
            .execute()
    },

    deleteMetadata: async (databaseId: string, physicalName: string) => {
        await db
            .deleteFrom('collections')
            .where('database_id', '=', databaseId)
            .where('physical_name', '=', physicalName)
            .execute()
    },

    // Physical Table Operations (Tenant DB)
    checkPhysicalTableExists: async (databaseId: string, physicalName: string) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) return false

        const adapter = connectionManager.getAdapter(databaseId) || defaultAdapter

        const query = adapter.tableExistsQuery(physicalName)
        const result = await query.execute(targetDb)
        return (result.rows[0] as any).exists === true
    },

    createPhysicalTable: async (databaseId: string, physicalName: string, idType: 'serial' | 'uuid' | 'text' | 'typeid' = 'serial', dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect to data source')

        const adapter = connectionManager.getAdapter(databaseId) || defaultAdapter
        const rawSql = adapter.createTableSql(physicalName, idType)

        if (dryRun) {
            return previewRawSql(rawSql.compile(targetDb).sql)
        }

        await rawSql.execute(targetDb)
    },

    deletePhysicalTable: async (databaseId: string, physicalName: string, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect to data source')

        const adapter = connectionManager.getAdapter(databaseId) || defaultAdapter
        const rawSql = adapter.dropTableSql(physicalName)

        if (dryRun) {
            return previewRawSql(rawSql.compile(targetDb).sql)
        }

        await rawSql.execute(targetDb)
    },

    // Field Operations
    getFields: async (databaseId: string, physicalName: string) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        const adapter = connectionManager.getAdapter(databaseId) || defaultAdapter
        const query = adapter.getColumnsQuery(physicalName)
        const result = await query.execute(targetDb)
        return result.rows
    },

    addField: async (databaseId: string, physicalName: string, fieldName: string, type: string, isNullable: boolean, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        const adapter = connectionManager.getAdapter(databaseId) || defaultAdapter
        const rawSql = adapter.addColumnSql(physicalName, fieldName, type, isNullable)

        if (dryRun) return previewRawSql(rawSql.compile(targetDb).sql)

        await rawSql.execute(targetDb)
    },

    addArrayField: async (databaseId: string, physicalName: string, fieldName: string, elementType: string, defaultValue?: string, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        const adapter = connectionManager.getAdapter(databaseId) || defaultAdapter
        const rawSql = adapter.addArrayColumnSql(physicalName, fieldName, elementType, defaultValue)

        if (dryRun) return previewRawSql(rawSql.compile(targetDb).sql)

        await rawSql.execute(targetDb)
    },

    removeField: async (databaseId: string, physicalName: string, fieldName: string, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        const adapter = connectionManager.getAdapter(databaseId) || defaultAdapter
        const rawSql = adapter.dropColumnSql(physicalName, fieldName)
        if (dryRun) return previewRawSql(rawSql.compile(targetDb).sql)

        await rawSql.execute(targetDb)
    },

    renameField: async (databaseId: string, physicalName: string, oldName: string, newName: string, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        const adapter = connectionManager.getAdapter(databaseId) || defaultAdapter
        const rawSql = adapter.renameColumnSql(physicalName, oldName, newName)
        if (dryRun) return previewRawSql(rawSql.compile(targetDb).sql)

        await rawSql.execute(targetDb)
    },

    // Index Operations
    getIndexes: async (dataSourceId: string, physicalName: string) => {
        const targetDb = await connectionManager.getConnection(dataSourceId)
        if (!targetDb) throw new Error('Could not connect')

        const adapter = connectionManager.getAdapter(dataSourceId) || defaultAdapter
        const query = adapter.getIndexesQuery(physicalName)
        const result = await query.execute(targetDb)
        return result.rows
    },

    createIndex: async (dataSourceId: string, physicalName: string, indexName: string, columns: string[], unique: boolean, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(dataSourceId)
        if (!targetDb) throw new Error('Could not connect')

        const adapter = connectionManager.getAdapter(dataSourceId) || defaultAdapter
        const rawSql = adapter.createIndexSql(physicalName, indexName, columns, unique)

        if (dryRun) return previewRawSql(rawSql.compile(targetDb).sql)

        await rawSql.execute(targetDb)
    },

    removeIndex: async (dataSourceId: string, indexName: string, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(dataSourceId)
        if (!targetDb) throw new Error('Could not connect')

        const adapter = connectionManager.getAdapter(dataSourceId) || defaultAdapter
        const rawSql = adapter.dropIndexSql(indexName)
        if (dryRun) return previewRawSql(rawSql.compile(targetDb).sql)

        await rawSql.execute(targetDb)
    }
}

