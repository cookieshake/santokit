import { sql } from 'drizzle-orm'
import { connectionManager } from '@/db/connection-manager.js'

export const collectionRepository = {
    // Introspection Operations
    // Metadata Table Operations
    ensureMetadataTable: async (dataSourceName: string) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect to data source')

        // Check if table exists to avoid error logs or unnecessary calls
        // But CREATE TABLE IF NOT EXISTS is standard.
        await targetDb.execute(sql.raw(`
            CREATE TABLE IF NOT EXISTS "_collections" (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                physical_name TEXT NOT NULL UNIQUE,
                type TEXT NOT NULL DEFAULT 'base',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `))
    },

    // Introspection Operations
    listPhysicalTables: async (dataSourceName: string, prefix: string, projectId: number) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect to data source')

        // Ensure metadata table exists (just in case)
        // In a read operation, maybe we shouldn't create it? 
        // If it doesn't exist, it means no collections created yet via new system.
        // We can check existence or just try query.
        // Let's try query and catch error if strictly needed, or just assume it exists if we created project properly.
        // But for safety/lazy init:
        const check = await targetDb.execute(sql.raw(`SELECT to_regclass('public._collections')`))
        if (!check.rows[0].to_regclass) {
            return []
        }

        const query = sql.raw(`
            SELECT name, physical_name, type
            FROM "_collections"
            WHERE physical_name LIKE '${prefix}p${projectId}_%'
        `)

        const rows = (await targetDb.execute(query)).rows

        return rows.map((row: any) => ({
            projectId,
            name: row.name,
            physicalName: row.physical_name,
            type: row.type
        }))
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

    getCollectionType: async (dataSourceName: string, physicalName: string) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) return 'base'

        try {
            const result = await targetDb.execute(sql.raw(`
                SELECT type FROM "_collections" WHERE physical_name = '${physicalName}'
            `))

            if (result.rows.length > 0) {
                return result.rows[0].type
            }
            return 'base'
        } catch (e) {
            // If table doesn't exist etc
            return 'base'
        }
    },

    // Physical Table Operations
    createPhysicalTable: async (dataSourceName: string, name: string, physicalName: string, idType: 'serial' | 'uuid' = 'serial', type: 'base' | 'auth' = 'base') => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect to data source')

        // Ensure metadata table
        await collectionRepository.ensureMetadataTable(dataSourceName)

        const idCol = idType === 'uuid'
            ? 'id UUID PRIMARY KEY DEFAULT gen_random_uuid()'
            : 'id SERIAL PRIMARY KEY'

        await targetDb.execute(sql.raw(`CREATE TABLE "${physicalName}" (${idCol}, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`))

        // Insert metadata
        await targetDb.execute(sql.raw(`
            INSERT INTO "_collections" (name, physical_name, type)
            VALUES ('${name}', '${physicalName}', '${type}')
        `))
    },

    deletePhysicalTable: async (dataSourceName: string, physicalName: string) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect to data source')

        // Drop table
        await targetDb.execute(sql.raw(`DROP TABLE IF EXISTS "${physicalName}"`))

        // Remove metadata if exists
        // Check if _collections exists first? ensureMetadataTable checks might be overkill here but safe?
        // Let's just try delete, if table doesn't exist it might throw.
        // Better to check relation exists or just wrap in try-catch.
        try {
            await targetDb.execute(sql.raw(`DELETE FROM "_collections" WHERE physical_name = '${physicalName}'`))
        } catch (e) {
            // ignore if _collections doesn't exist
        }
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
