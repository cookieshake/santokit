import { collectionRepository } from '@/modules/collection/collection.repository.js'
import { projectRepository } from '@/modules/project/project.repository.js'
import { connectionManager } from '@/db/connection-manager.js'
import { sql } from 'drizzle-orm'
import { previewSql as apiPreviewSql } from './sql-preview.js'

export const collectionService = {
    create: async (databaseId: number, name: string, idType: 'serial' | 'uuid' = 'serial', type: 'base' | 'auth' = 'base', dryRun: boolean = false) => {
        // 1. Get Database
        const database = await projectRepository.findDatabaseById(databaseId)
        if (!database) throw new Error('Database not found')

        const projectId = database.projectId
        if (!projectId) throw new Error('Database is not linked to a project')

        // 2. Generate Physical Name
        const physicalName = `${database.prefix}p${projectId}_${name}`.toLowerCase()
        const collectionTableName = `${database.prefix}p${projectId}__collections`.toLowerCase()

        // 3. Create Physical Table
        const sqls: string[] = []
        const tableSql = await collectionRepository.createPhysicalTable(databaseId, collectionTableName, name, physicalName, idType, type, dryRun)
        if (dryRun && tableSql) sqls.push(tableSql as string)

        // 3.1 If type is 'auth', add default fields
        if (type === 'auth') {
            if (dryRun) {
                // For auth type, we need to gather all additional SQLs
                sqls.push(apiPreviewSql(sql`ALTER TABLE ${sql.identifier(physicalName)} ADD COLUMN "email" TEXT NOT NULL`))
                sqls.push(apiPreviewSql(sql`ALTER TABLE ${sql.identifier(physicalName)} ADD COLUMN "password" TEXT NOT NULL`))
                sqls.push(apiPreviewSql(sql`ALTER TABLE ${sql.identifier(physicalName)} ADD COLUMN "name" TEXT NOT NULL`))
                sqls.push(`ALTER TABLE "${physicalName}" ADD COLUMN "roles" TEXT[] DEFAULT '{"user"}'`)
                sqls.push(apiPreviewSql(sql`CREATE UNIQUE INDEX ${sql.identifier(`${physicalName}_email_idx`)} ON ${sql.identifier(physicalName)} ("email")`))
            } else {
                await collectionRepository.addField(databaseId, physicalName, 'email', 'text', false)
                await collectionRepository.addField(databaseId, physicalName, 'password', 'text', false)
                await collectionRepository.addField(databaseId, physicalName, 'name', 'text', false)

                // Add roles column manually since addField doesn't support arrays yet
                const targetDb = await connectionManager.getConnection(databaseId)
                if (targetDb) {
                    await targetDb.execute(sql.raw(`ALTER TABLE "${physicalName}" ADD COLUMN "roles" TEXT[] DEFAULT '{"user"}'`))
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

    listByDatabase: async (databaseId: number) => {
        const database = await projectRepository.findDatabaseById(databaseId)
        if (!database) throw new Error('Database not found')
        const projectId = database.projectId
        if (!projectId) throw new Error('Database not linked to project')

        const collectionTableName = `${database.prefix}p${projectId}__collections`.toLowerCase()
        return await collectionRepository.listPhysicalTables(databaseId, collectionTableName, database.prefix, projectId)
    },

    getDetail: async (databaseId: number, collectionName: string) => {
        const database = await projectRepository.findDatabaseById(databaseId)
        if (!database) throw new Error('Database not found')
        const projectId = database.projectId
        if (!projectId) throw new Error('Database not linked to project')

        const physicalName = `${database.prefix}p${projectId}_${collectionName}`.toLowerCase()
        const exists = await collectionRepository.checkPhysicalTableExists(databaseId, physicalName)

        if (!exists) throw new Error('Collection not found')

        const collectionTableName = `${database.prefix}p${projectId}__collections`.toLowerCase()
        const fields = await collectionRepository.getFields(databaseId, physicalName)
        const indexes = await collectionRepository.getIndexes(databaseId, physicalName)
        const type = await collectionRepository.getCollectionType(databaseId, collectionTableName, physicalName)

        return {
            meta: { projectId, databaseId, name: collectionName, physicalName, type },
            fields,
            indexes
        }
    },

    // Field Management
    addField: async (databaseId: number, collectionName: string, fieldName: string, type: string, isNullable: boolean, dryRun: boolean = false) => {
        const database = await projectRepository.findDatabaseById(databaseId)
        if (!database) throw new Error('Database not found')
        const projectId = database.projectId
        if (!projectId) throw new Error('Database not linked to project')

        const physicalName = `${database.prefix}p${projectId}_${collectionName}`.toLowerCase()
        const exists = await collectionRepository.checkPhysicalTableExists(databaseId, physicalName)
        if (!exists) throw new Error('Collection not found')

        const sql = await collectionRepository.addField(databaseId, physicalName, fieldName, type, isNullable, dryRun)
        if (dryRun) return { sql }
    },

    removeField: async (databaseId: number, collectionName: string, fieldName: string, dryRun: boolean = false) => {
        const database = await projectRepository.findDatabaseById(databaseId)
        if (!database) throw new Error('Database not found')
        const projectId = database.projectId
        if (!projectId) throw new Error('Database not linked to project')

        const physicalName = `${database.prefix}p${projectId}_${collectionName}`.toLowerCase()
        const exists = await collectionRepository.checkPhysicalTableExists(databaseId, physicalName)
        if (!exists) throw new Error('Collection not found')

        const sql = await collectionRepository.removeField(databaseId, physicalName, fieldName, dryRun)
        if (dryRun) return { sql }
    },

    renameField: async (databaseId: number, collectionName: string, oldName: string, newName: string, dryRun: boolean = false) => {
        const database = await projectRepository.findDatabaseById(databaseId)
        if (!database) throw new Error('Database not found')
        const projectId = database.projectId
        if (!projectId) throw new Error('Database not linked to project')

        const physicalName = `${database.prefix}p${projectId}_${collectionName}`.toLowerCase()
        const exists = await collectionRepository.checkPhysicalTableExists(databaseId, physicalName)
        if (!exists) throw new Error('Collection not found')

        const sql = await collectionRepository.renameField(databaseId, physicalName, oldName, newName, dryRun)
        if (dryRun) return { sql }
    },

    // Index Management
    createIndex: async (databaseId: number, collectionName: string, indexName: string, fields: string[], unique: boolean, dryRun: boolean = false) => {
        const database = await projectRepository.findDatabaseById(databaseId)
        if (!database) throw new Error('Database not found')
        const projectId = database.projectId
        if (!projectId) throw new Error('Database not linked to project')

        const physicalName = `${database.prefix}p${projectId}_${collectionName}`.toLowerCase()
        const exists = await collectionRepository.checkPhysicalTableExists(databaseId, physicalName)
        if (!exists) throw new Error('Collection not found')

        const fullIndexName = `${database.prefix}idx_${physicalName}_${indexName}`
        const sql = await collectionRepository.createIndex(databaseId, physicalName, fullIndexName, fields, unique, dryRun)
        if (dryRun) return { sql }
        return fullIndexName
    },

    removeIndex: async (databaseId: number, collectionName: string, indexName: string, dryRun: boolean = false) => {
        const database = await projectRepository.findDatabaseById(databaseId)
        if (!database) throw new Error('Database not found')
        const projectId = database.projectId
        if (!projectId) throw new Error('Database not linked to project')

        const physicalName = `${database.prefix}p${projectId}_${collectionName}`.toLowerCase()
        const exists = await collectionRepository.checkPhysicalTableExists(databaseId, physicalName)
        if (!exists) throw new Error('Collection not found')

        const fullIndexName = `${database.prefix}idx_${physicalName}_${indexName}`
        const sql = await collectionRepository.removeIndex(databaseId, fullIndexName, dryRun)
        if (dryRun) return { sql }
        return fullIndexName
    }
}
