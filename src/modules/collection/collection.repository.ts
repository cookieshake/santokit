import { sql } from 'drizzle-orm'
import { previewSql } from './sql-preview.js'

import { connectionManager } from '@/db/connection-manager.js'

export const collectionRepository = {
    // Introspection Operations
    // Metadata Table Operations
    // Metadata Table Operations
    ensureMetadataTable: async (dataSourceName: string, metadataTableName: string) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect to data source')

        // Check if table exists to avoid error logs or unnecessary calls
        await targetDb.execute(sql`
            CREATE TABLE IF NOT EXISTS ${sql.identifier(metadataTableName)} (
                id SERIAL PRIMARY KEY,
                name TEXT NOT NULL,
                physical_name TEXT NOT NULL UNIQUE,
                type TEXT NOT NULL DEFAULT 'base',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `)
    },

    // Introspection Operations
    // Introspection Operations
    listPhysicalTables: async (dataSourceName: string, metadataTableName: string, prefix: string, projectId: number) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect to data source')

        // Check if metadata table exists
        const check = await targetDb.execute(sql`SELECT to_regclass(${metadataTableName})`)
        if (!check.rows[0].to_regclass) {
            return []
        }

        const rows = await targetDb.execute(sql`
            SELECT name, physical_name as "physicalName", type
            FROM ${sql.identifier(metadataTableName)}
            WHERE physical_name LIKE ${`${prefix}p${projectId}_%`}
        `)

        return rows.rows.map(row => ({
            projectId,
            name: row.name,
            physicalName: row.physicalName,
            type: row.type
        }))
    },

    checkPhysicalTableExists: async (dataSourceName: string, physicalName: string) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) return false

        const result = await targetDb.execute(sql`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = ${physicalName}
            )
        `)

        return result.rows[0].exists === true
    },

    getCollectionType: async (dataSourceName: string, metadataTableName: string, physicalName: string) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) return 'base'

        try {
            const result = await targetDb.execute(sql`
                SELECT type FROM ${sql.identifier(metadataTableName)}
                WHERE physical_name = ${physicalName}
                LIMIT 1
            `)

            if (result.rows.length > 0) {
                return result.rows[0].type
            }
            return 'base'
        } catch (e) {
            return 'base'
        }
    },

    // Physical Table Operations
    // Physical Table Operations
    createPhysicalTable: async (dataSourceName: string, metadataTableName: string, name: string, physicalName: string, idType: 'serial' | 'uuid' = 'serial', type: 'base' | 'auth' = 'base', dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect to data source')

        // Ensure metadata table
        if (!dryRun) {
            await collectionRepository.ensureMetadataTable(dataSourceName, metadataTableName)
        }

        const idCol = idType === 'uuid'
            ? 'id UUID PRIMARY KEY DEFAULT gen_random_uuid()'
            : 'id SERIAL PRIMARY KEY'

        const createTableSql = sql`CREATE TABLE ${sql.identifier(physicalName)} (${sql.raw(idCol)}, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`

        if (dryRun) {
            return previewSql(createTableSql)
        }

        await targetDb.execute(createTableSql)

        // Insert metadata
        await targetDb.execute(sql`
            INSERT INTO ${sql.identifier(metadataTableName)} (name, physical_name, type)
            VALUES (${name}, ${physicalName}, ${type})
        `)
    },

    deletePhysicalTable: async (dataSourceName: string, metadataTableName: string, physicalName: string, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect to data source')

        const dropTableSql = sql`DROP TABLE IF EXISTS ${sql.identifier(physicalName)}`

        if (dryRun) {
            return previewSql(dropTableSql)
        }

        // Drop table
        await targetDb.execute(dropTableSql)

        // Remove metadata if exists
        try {
            await targetDb.execute(sql`
                DELETE FROM ${sql.identifier(metadataTableName)}
                WHERE physical_name = ${physicalName}
            `)
        } catch (e) {
            // ignore
        }
    },

    // Field Operations
    getFields: async (dataSourceName: string, physicalName: string) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect')
        return (await targetDb.execute(sql`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = ${physicalName}
        `)).rows
    },

    addField: async (dataSourceName: string, physicalName: string, fieldName: string, type: string, isNullable: boolean, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect')

        let sqlType = 'TEXT'
        if (type === 'integer') sqlType = 'INTEGER'
        if (type === 'boolean') sqlType = 'BOOLEAN'
        let sqlNullable = isNullable ? 'NULL' : 'NOT NULL'

        const query = sql`ALTER TABLE ${sql.identifier(physicalName)} ADD COLUMN ${sql.identifier(fieldName)} ${sql.raw(sqlType)} ${sql.raw(sqlNullable)}`

        if (dryRun) return previewSql(query)

        await targetDb.execute(query)
    },

    removeField: async (dataSourceName: string, physicalName: string, fieldName: string, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect')

        const query = sql`ALTER TABLE ${sql.identifier(physicalName)} DROP COLUMN ${sql.identifier(fieldName)}`
        if (dryRun) return previewSql(query)

        await targetDb.execute(query)
    },

    renameField: async (dataSourceName: string, physicalName: string, oldName: string, newName: string, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect')

        const query = sql`ALTER TABLE ${sql.identifier(physicalName)} RENAME COLUMN ${sql.identifier(oldName)} TO ${sql.identifier(newName)}`
        if (dryRun) return previewSql(query)

        await targetDb.execute(query)
    },

    // Index Operations
    getIndexes: async (dataSourceName: string, physicalName: string) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect')
        return (await targetDb.execute(sql`
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = ${physicalName}
        `)).rows
    },

    createIndex: async (dataSourceName: string, physicalName: string, indexName: string, columns: string[], unique: boolean, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect')

        const uniqueStr = unique ? 'UNIQUE' : ''

        // Drizzle sql tag does not automatically join array of identifiers with comma this way easily, but we can map
        const colsSql = sql.join(columns.map(c => sql.identifier(c)), sql`, `)

        const query = sql`CREATE ${sql.raw(uniqueStr)} INDEX ${sql.identifier(indexName)} ON ${sql.identifier(physicalName)} (${colsSql})`

        if (dryRun) return previewSql(query)

        await targetDb.execute(query)
    },

    removeIndex: async (dataSourceName: string, indexName: string, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(dataSourceName)
        if (!targetDb) throw new Error('Could not connect')

        const query = sql`DROP INDEX ${sql.identifier(indexName)}`
        if (dryRun) return previewSql(query)

        await targetDb.execute(query)
    }
}
