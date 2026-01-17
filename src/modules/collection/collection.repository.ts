import { sql, eq, and } from 'drizzle-orm'
import { previewSql } from './sql-preview.js'

import { connectionManager } from '@/db/connection-manager.js'
import { db } from '@/db/index.js'
import { collections } from '@/db/schema.js'

export const collectionRepository = {
    // Metadata Operations (Main DB)
    list: async (databaseId: number) => {
        return await db.select().from(collections).where(eq(collections.databaseId, databaseId))
    },

    findByName: async (databaseId: number, name: string) => {
        return await db.query.collections.findFirst({
            where: and(
                eq(collections.databaseId, databaseId),
                eq(collections.name, name)
            )
        })
    },

    createMetadata: async (projectId: number, databaseId: number, name: string, physicalName: string, type: 'base' | 'auth' = 'base') => {
        return await db.insert(collections).values({
            projectId,
            databaseId,
            name,
            physicalName,
            type
        }).returning()
    },

    deleteMetadata: async (databaseId: number, physicalName: string) => {
        await db.delete(collections).where(
            and(
                eq(collections.databaseId, databaseId),
                eq(collections.physicalName, physicalName)
            )
        )
    },

    // Physical Table Operations (Tenant DB)
    checkPhysicalTableExists: async (databaseId: number, physicalName: string) => {
        const targetDb = await connectionManager.getConnection(databaseId)
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

    createPhysicalTable: async (databaseId: number, physicalName: string, idType: 'serial' | 'uuid' = 'serial', dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect to data source')

        const idCol = idType === 'uuid'
            ? 'id UUID PRIMARY KEY DEFAULT gen_random_uuid()'
            : 'id SERIAL PRIMARY KEY'

        const createTableSql = sql`CREATE TABLE ${sql.identifier(physicalName)} (${sql.raw(idCol)}, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`

        if (dryRun) {
            return previewSql(createTableSql)
        }

        await targetDb.execute(createTableSql)
    },

    deletePhysicalTable: async (databaseId: number, physicalName: string, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect to data source')

        const dropTableSql = sql`DROP TABLE IF EXISTS ${sql.identifier(physicalName)}`

        if (dryRun) {
            return previewSql(dropTableSql)
        }

        await targetDb.execute(dropTableSql)
    },

    // Field Operations
    getFields: async (databaseId: number, physicalName: string) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')
        return (await targetDb.execute(sql`
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns 
            WHERE table_name = ${physicalName}
        `)).rows
    },

    addField: async (databaseId: number, physicalName: string, fieldName: string, type: string, isNullable: boolean, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        let sqlType = 'TEXT'
        if (type === 'integer') sqlType = 'INTEGER'
        if (type === 'boolean') sqlType = 'BOOLEAN'
        let sqlNullable = isNullable ? 'NULL' : 'NOT NULL'

        const query = sql`ALTER TABLE ${sql.identifier(physicalName)} ADD COLUMN ${sql.identifier(fieldName)} ${sql.raw(sqlType)} ${sql.raw(sqlNullable)}`

        if (dryRun) return previewSql(query)

        await targetDb.execute(query)
    },

    removeField: async (databaseId: number, physicalName: string, fieldName: string, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        const query = sql`ALTER TABLE ${sql.identifier(physicalName)} DROP COLUMN ${sql.identifier(fieldName)}`
        if (dryRun) return previewSql(query)

        await targetDb.execute(query)
    },

    renameField: async (databaseId: number, physicalName: string, oldName: string, newName: string, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        const query = sql`ALTER TABLE ${sql.identifier(physicalName)} RENAME COLUMN ${sql.identifier(oldName)} TO ${sql.identifier(newName)}`
        if (dryRun) return previewSql(query)

        await targetDb.execute(query)
    },

    // Index Operations
    getIndexes: async (dataSourceId: number, physicalName: string) => {
        const targetDb = await connectionManager.getConnection(dataSourceId)
        if (!targetDb) throw new Error('Could not connect')
        return (await targetDb.execute(sql`
            SELECT indexname, indexdef 
            FROM pg_indexes 
            WHERE tablename = ${physicalName}
        `)).rows
    },

    createIndex: async (dataSourceId: number, physicalName: string, indexName: string, columns: string[], unique: boolean, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(dataSourceId)
        if (!targetDb) throw new Error('Could not connect')

        const uniqueStr = unique ? 'UNIQUE' : ''

        // Drizzle sql tag does not automatically join array of identifiers with comma this way easily, but we can map
        const colsSql = sql.join(columns.map(c => sql.identifier(c)), sql`, `)

        const query = sql`CREATE ${sql.raw(uniqueStr)} INDEX ${sql.identifier(indexName)} ON ${sql.identifier(physicalName)} (${colsSql})`

        if (dryRun) return previewSql(query)

        await targetDb.execute(query)
    },

    removeIndex: async (dataSourceId: number, indexName: string, dryRun: boolean = false) => {
        const targetDb = await connectionManager.getConnection(dataSourceId)
        if (!targetDb) throw new Error('Could not connect')

        const query = sql`DROP INDEX ${sql.identifier(indexName)}`
        if (dryRun) return previewSql(query)

        await targetDb.execute(query)
    }
}
