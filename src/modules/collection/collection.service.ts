import { collectionRepository } from '@/modules/collection/collection.repository.js'
import { databaseRepository } from '@/modules/database/database.repository.js'
import { connectionManager } from '@/db/connection-manager.js'
import { sql } from 'kysely'
import { previewRawSql } from './sql-preview.js'
import { typeid } from 'typeid-js'

export const collectionService = {
    create: async (databaseId: string, name: string, idType: 'serial' | 'uuid' | 'text' | 'typeid' = 'serial', type: 'base' | 'auth' = 'base', dryRun: boolean = false) => {
        // 1. Get Database
        const database = await databaseRepository.findById(databaseId)
        if (!database) throw new Error('Database not found')

        const projectId = database.project_id
        if (!projectId) throw new Error('Database is not linked to a project')

        // 2. Generate Physical Name
        const physicalName = `${database.prefix}p${projectId}_${name}`.toLowerCase()

        // 3. Create Physical Table
        const sqls: string[] = []
        const tableSql = await collectionRepository.createPhysicalTable(databaseId, physicalName, idType, dryRun)
        if (dryRun && tableSql) sqls.push(tableSql as string)

        if (!dryRun) {
            // 3.0 Insert Metadata into Main DB
            const id = typeid('col').toString()
            await collectionRepository.createMetadata(id, projectId, databaseId, name, physicalName, type)
        } else {
            sqls.push(`-- Metadata insertion into main DB skipped for dry-run`)
        }

        // 3.1 If type is 'auth', add default fields
        if (type === 'auth') {
            if (dryRun) {
                // For auth type, we need to gather all additional SQLs
                sqls.push(previewRawSql(`ALTER TABLE "${physicalName}" ADD COLUMN "email" TEXT NOT NULL`))
                sqls.push(previewRawSql(`ALTER TABLE "${physicalName}" ADD COLUMN "password" TEXT NOT NULL`))
                sqls.push(previewRawSql(`ALTER TABLE "${physicalName}" ADD COLUMN "name" TEXT NOT NULL`))
                sqls.push(`ALTER TABLE "${physicalName}" ADD COLUMN "roles" TEXT[] DEFAULT '{"user"}'`)
                sqls.push(previewRawSql(`CREATE UNIQUE INDEX "${physicalName}_email_idx" ON "${physicalName}" ("email")`))
            } else {
                await collectionRepository.addField(databaseId, physicalName, 'email', 'text', false)
                await collectionRepository.addField(databaseId, physicalName, 'password', 'text', false)
                await collectionRepository.addField(databaseId, physicalName, 'name', 'text', false)

                // Add roles column manually since addField doesn't support arrays yet
                const targetDb = await connectionManager.getConnection(databaseId)
                if (targetDb) {
                    await sql.raw(`ALTER TABLE "${physicalName}" ADD COLUMN "roles" TEXT[] DEFAULT '{"user"}'`).execute(targetDb)
                }

                // Email should be unique
                await collectionRepository.createIndex(databaseId, physicalName, `${physicalName}_email_idx`, ['email'], true)
            }
        }

        if (dryRun) {
            return { sql: sqls.join(';\n') }
        }

        // 4. Return "Virtual" Collection Object
        return {
            databaseId,
            projectId,
            name,
            physicalName,
            idType,
            type
        }
    },

    listByDatabase: async (databaseId: string) => {
        // Just list from Main DB
        return await collectionRepository.list(databaseId)
    },

    getDetail: async (databaseId: string, collectionName: string) => {
        const database = await databaseRepository.findById(databaseId)
        if (!database) throw new Error('Database not found')
        const projectId = database.project_id
        if (!projectId) throw new Error('Database not linked to project')

        // Find metadata first
        const collection = await collectionRepository.findByName(databaseId, collectionName)
        if (!collection) throw new Error('Collection not found')

        const physicalName = collection.physical_name
        const exists = await collectionRepository.checkPhysicalTableExists(databaseId, physicalName)

        if (!exists) throw new Error('Physical table not found (integrity error)')

        const fields = await collectionRepository.getFields(databaseId, physicalName)
        const indexes = await collectionRepository.getIndexes(databaseId, physicalName)

        return {
            meta: collection,
            fields,
            indexes
        }
    },

    // Field Management
    addField: async (databaseId: string, collectionName: string, fieldName: string, type: string, isNullable: boolean, dryRun: boolean = false) => {
        const database = await databaseRepository.findById(databaseId)
        if (!database) throw new Error('Database not found')

        // Find metadata first to get physical name
        const collection = await collectionRepository.findByName(databaseId, collectionName)
        if (!collection) throw new Error('Collection not found')

        const physicalName = collection.physical_name
        const exists = await collectionRepository.checkPhysicalTableExists(databaseId, physicalName)
        if (!exists) throw new Error('Physical table not found')

        const sqlResult = await collectionRepository.addField(databaseId, physicalName, fieldName, type, isNullable, dryRun)
        if (dryRun) return { sql: sqlResult }
    },

    removeField: async (databaseId: string, collectionName: string, fieldName: string, dryRun: boolean = false) => {
        const database = await databaseRepository.findById(databaseId)
        if (!database) throw new Error('Database not found')

        const collection = await collectionRepository.findByName(databaseId, collectionName)
        if (!collection) throw new Error('Collection not found')

        const physicalName = collection.physical_name
        const exists = await collectionRepository.checkPhysicalTableExists(databaseId, physicalName)
        if (!exists) throw new Error('Physical table not found')

        const sqlResult = await collectionRepository.removeField(databaseId, physicalName, fieldName, dryRun)
        if (dryRun) return { sql: sqlResult }
    },

    renameField: async (databaseId: string, collectionName: string, oldName: string, newName: string, dryRun: boolean = false) => {
        const database = await databaseRepository.findById(databaseId)
        if (!database) throw new Error('Database not found')

        const collection = await collectionRepository.findByName(databaseId, collectionName)
        if (!collection) throw new Error('Collection not found')

        const physicalName = collection.physical_name
        const exists = await collectionRepository.checkPhysicalTableExists(databaseId, physicalName)
        if (!exists) throw new Error('Physical table not found')

        const sqlResult = await collectionRepository.renameField(databaseId, physicalName, oldName, newName, dryRun)
        if (dryRun) return { sql: sqlResult }
    },

    // Index Management
    createIndex: async (databaseId: string, collectionName: string, indexName: string, fields: string[], unique: boolean, dryRun: boolean = false) => {
        const database = await databaseRepository.findById(databaseId)
        if (!database) throw new Error('Database not found')

        const collection = await collectionRepository.findByName(databaseId, collectionName)
        if (!collection) throw new Error('Collection not found')

        const physicalName = collection.physical_name
        const exists = await collectionRepository.checkPhysicalTableExists(databaseId, physicalName)
        if (!exists) throw new Error('Physical table not found')

        const fullIndexName = `${database.prefix}idx_${physicalName}_${indexName}`
        const sqlResult = await collectionRepository.createIndex(databaseId, physicalName, fullIndexName, fields, unique, dryRun)
        if (dryRun) return { sql: sqlResult }
        return fullIndexName
    },

    removeIndex: async (databaseId: string, collectionName: string, indexName: string, dryRun: boolean = false) => {
        const database = await databaseRepository.findById(databaseId)
        if (!database) throw new Error('Database not found')

        const collection = await collectionRepository.findByName(databaseId, collectionName)
        if (!collection) throw new Error('Collection not found')

        const physicalName = collection.physical_name
        const exists = await collectionRepository.checkPhysicalTableExists(databaseId, physicalName)
        if (!exists) throw new Error('Physical table not found')

        const fullIndexName = `${database.prefix}idx_${physicalName}_${indexName}`
        const sqlResult = await collectionRepository.removeIndex(databaseId, fullIndexName, dryRun)
        if (dryRun) return { sql: sqlResult }
        return fullIndexName
    }
}
