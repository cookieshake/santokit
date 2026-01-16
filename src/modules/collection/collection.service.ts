import { collectionRepository } from '@/modules/collection/collection.repository.js'
// dataSourceRepository import removed
import { projectRepository } from '@/modules/project/project.repository.js'
import { connectionManager } from '@/db/connection-manager.js'
import { sql } from 'drizzle-orm'
import { previewSql as apiPreviewSql } from './sql-preview.js'

export const collectionService = {
    create: async (projectId: number, name: string, idType: 'serial' | 'uuid' = 'serial', type: 'base' | 'auth' = 'base', dryRun: boolean = false) => {
        // 1. Get Project
        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found') // removed dataSource check

        // 2. Generate Physical Name
        const physicalName = `${project.prefix}p${projectId}_${name}`.toLowerCase()
        const collectionTableName = `${project.prefix}p${projectId}__collections`.toLowerCase()

        // 3. Create Physical Table
        // 3. Create Physical Table
        const sqls: string[] = []
        const tableSql = await collectionRepository.createPhysicalTable(project.name, collectionTableName, name, physicalName, idType, type, dryRun)
        if (dryRun && tableSql) sqls.push(tableSql as string)

        // 3.1 If type is 'auth', add default fields
        if (type === 'auth') {
            if (dryRun) {
                // For auth type, we need to gather all additional SQLs
                // Note: logic follows the non-dryRun path
                sqls.push(apiPreviewSql(sql`ALTER TABLE ${sql.identifier(physicalName)} ADD COLUMN "email" TEXT NOT NULL`))
                sqls.push(apiPreviewSql(sql`ALTER TABLE ${sql.identifier(physicalName)} ADD COLUMN "password" TEXT NOT NULL`))
                sqls.push(apiPreviewSql(sql`ALTER TABLE ${sql.identifier(physicalName)} ADD COLUMN "name" TEXT NOT NULL`))
                sqls.push(`ALTER TABLE "${physicalName}" ADD COLUMN "roles" TEXT[] DEFAULT '{"user"}'`)
                sqls.push(apiPreviewSql(sql`CREATE UNIQUE INDEX ${sql.identifier(`${physicalName}_email_idx`)} ON ${sql.identifier(physicalName)} ("email")`))
            } else {
                await collectionRepository.addField(project.name, physicalName, 'email', 'text', false)
                await collectionRepository.addField(project.name, physicalName, 'password', 'text', false)
                await collectionRepository.addField(project.name, physicalName, 'name', 'text', false)

                // Add roles column manually since addField doesn't support arrays yet
                const targetDb = await connectionManager.getConnection(project.name)
                if (targetDb) {
                    await targetDb.execute(sql.raw(`ALTER TABLE "${physicalName}" ADD COLUMN "roles" TEXT[] DEFAULT '{"user"}'`))
                }

                // Email should be unique
                await collectionRepository.createIndex(project.name, physicalName, `${physicalName}_email_idx`, ['email'], true)
            }
        }

        if (dryRun) {
            return { sql: sqls.join(';\n') }
        }

        // 4. Return "Virtual" Collection Object
        return {
            projectId,
            name,
            physicalName,
            idType,
            type
        }
    },

    listByProject: async (projectId: number) => {
        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found')

        const collectionTableName = `${project.prefix}p${projectId}__collections`.toLowerCase()
        return await collectionRepository.listPhysicalTables(project.name, collectionTableName, project.prefix, projectId)
    },

    getDetail: async (projectId: number, collectionName: string) => {
        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found')

        const physicalName = `${project.prefix}p${projectId}_${collectionName}`.toLowerCase()
        const exists = await collectionRepository.checkPhysicalTableExists(project.name, physicalName)

        if (!exists) throw new Error('Collection not found')

        const collectionTableName = `${project.prefix}p${projectId}__collections`.toLowerCase()
        const fields = await collectionRepository.getFields(project.name, physicalName)
        const indexes = await collectionRepository.getIndexes(project.name, physicalName)
        const type = await collectionRepository.getCollectionType(project.name, collectionTableName, physicalName)

        return {
            meta: { projectId, name: collectionName, physicalName, type },
            fields,
            indexes
        }
    },

    // Field Management
    addField: async (projectId: number, collectionName: string, fieldName: string, type: string, isNullable: boolean, dryRun: boolean = false) => {
        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found')

        const physicalName = `${project.prefix}p${projectId}_${collectionName}`.toLowerCase()
        const exists = await collectionRepository.checkPhysicalTableExists(project.name, physicalName)
        if (!exists) throw new Error('Collection not found')

        const sql = await collectionRepository.addField(project.name, physicalName, fieldName, type, isNullable, dryRun)
        if (dryRun) return { sql }
    },

    removeField: async (projectId: number, collectionName: string, fieldName: string, dryRun: boolean = false) => {
        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found')

        const physicalName = `${project.prefix}p${projectId}_${collectionName}`.toLowerCase()
        const exists = await collectionRepository.checkPhysicalTableExists(project.name, physicalName)
        if (!exists) throw new Error('Collection not found')

        const sql = await collectionRepository.removeField(project.name, physicalName, fieldName, dryRun)
        if (dryRun) return { sql }
    },

    renameField: async (projectId: number, collectionName: string, oldName: string, newName: string, dryRun: boolean = false) => {
        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found')

        const physicalName = `${project.prefix}p${projectId}_${collectionName}`.toLowerCase()
        const exists = await collectionRepository.checkPhysicalTableExists(project.name, physicalName)
        if (!exists) throw new Error('Collection not found')

        const sql = await collectionRepository.renameField(project.name, physicalName, oldName, newName, dryRun)
        if (dryRun) return { sql }
    },

    // Index Management
    createIndex: async (projectId: number, collectionName: string, indexName: string, fields: string[], unique: boolean, dryRun: boolean = false) => {
        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found')

        const physicalName = `${project.prefix}p${projectId}_${collectionName}`.toLowerCase()
        const exists = await collectionRepository.checkPhysicalTableExists(project.name, physicalName)
        if (!exists) throw new Error('Collection not found')

        const fullIndexName = `${project.prefix}idx_${physicalName}_${indexName}`
        const sql = await collectionRepository.createIndex(project.name, physicalName, fullIndexName, fields, unique, dryRun)
        if (dryRun) return { sql }
        return fullIndexName
    },

    removeIndex: async (projectId: number, collectionName: string, indexName: string, dryRun: boolean = false) => {
        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found')

        const physicalName = `${project.prefix}p${projectId}_${collectionName}`.toLowerCase()
        const exists = await collectionRepository.checkPhysicalTableExists(project.name, physicalName)
        if (!exists) throw new Error('Collection not found')

        const fullIndexName = `${project.prefix}idx_${physicalName}_${indexName}`
        const sql = await collectionRepository.removeIndex(project.name, fullIndexName, dryRun)
        if (dryRun) return { sql }
        return fullIndexName
    }
}
