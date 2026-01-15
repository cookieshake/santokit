import { sql } from 'drizzle-orm'
import { connectionManager } from '@/db/connection-manager.js'

export const collectionRepository = {
    // Introspection Operations
    listPhysicalTables: async (dataSourceName: string, prefix: string, projectId: number) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect to data source')

        // Pattern: {prefix}p{projectId}_{name}
        const namespacePrefix = `${prefix}p${projectId}_`
        const query = sql.raw(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name LIKE '${namespacePrefix}%'
        `)

        const rows = (await targetDb.execute(query)).rows

        return rows.map((row: any) => {
            const physicalName = row.table_name as string
            const name = physicalName.substring(namespacePrefix.length)
            return {
                projectId,
                name,
                physicalName,
                // We assume idType is not easily known without deeper inspection, 
                // but for listing it might optionally be fetched if needed.
                // For now, we return minimal info.
            }
        })
    },

    checkPhysicalTableExists: async (dataSourceName: string, physicalName: string) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) return false

        const result = await targetDb.execute(sql.raw(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = '${physicalName}'
            )
        `))

        return result.rows[0].exists === true
    },

    // Physical Table Operations
    createPhysicalTable: async (dataSourceName: string, physicalName: string, idType: 'serial' | 'uuid' = 'serial') => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect to data source')

        const idCol = idType === 'uuid'
            ? 'id UUID PRIMARY KEY DEFAULT gen_random_uuid()'
            : 'id SERIAL PRIMARY KEY'

        await targetDb.execute(sql.raw(`CREATE TABLE "${physicalName}" (${idCol}, created_at TIMESTAMP DEFAULT NOW())`))
    },

    // Field Operations
    getFields: async (dataSourceName: string, physicalName: string) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect')
        return (await targetDb.execute(sql.raw(`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = '${physicalName}'
        `))).rows
    },

    addField: async (dataSourceName: string, physicalName: string, fieldName: string, type: string, isNullable: boolean) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect')

        let sqlType = 'TEXT'
        if (type === 'integer') sqlType = 'INTEGER'
        if (type === 'boolean') sqlType = 'BOOLEAN'
        let sqlNullable = isNullable ? 'NULL' : 'NOT NULL'

        await targetDb.execute(sql.raw(`ALTER TABLE "${physicalName}" ADD COLUMN "${fieldName}" ${sqlType} ${sqlNullable}`))
    },

    removeField: async (dataSourceName: string, physicalName: string, fieldName: string) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect')
        await targetDb.execute(sql.raw(`ALTER TABLE "${physicalName}" DROP COLUMN "${fieldName}"`))
    },

    renameField: async (dataSourceName: string, physicalName: string, oldName: string, newName: string) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect')
        await targetDb.execute(sql.raw(`ALTER TABLE "${physicalName}" RENAME COLUMN "${oldName}" TO "${newName}"`))
    },

    // Index Operations
    getIndexes: async (dataSourceName: string, physicalName: string) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect')
        return (await targetDb.execute(sql.raw(`
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = '${physicalName}'
        `))).rows
    },

    createIndex: async (dataSourceName: string, physicalName: string, indexName: string, columns: string[], unique: boolean) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect')

        const columnsStr = columns.map(f => `"${f}"`).join(', ')
        const uniqueStr = unique ? 'UNIQUE' : ''

        await targetDb.execute(sql.raw(`CREATE ${uniqueStr} INDEX "${indexName}" ON "${physicalName}" (${columnsStr})`))
    },

    removeIndex: async (dataSourceName: string, indexName: string) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect')
        await targetDb.execute(sql.raw(`DROP INDEX "${indexName}"`))
    }
}
