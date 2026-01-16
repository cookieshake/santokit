import { collectionRepository } from '@/modules/collection/collection.repository.js'
// dataSourceRepository import removed
import { projectRepository } from '@/modules/project/project.repository.js'
import { connectionManager } from '@/db/connection-manager.js'
import { sql } from 'drizzle-orm'

export const collectionService = {
    create: async (projectId: number, name: string, idType: 'serial' | 'uuid' = 'serial', type: 'base' | 'auth' = 'base') => {
        // 1. Get Project
        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found') // removed dataSource check

        // 2. Generate Physical Name
        const physicalName = `${project.prefix}p${projectId}_${name}`.toLowerCase()

        // 3. Create Physical Table
        await collectionRepository.createPhysicalTable(project.name, name, physicalName, idType, type)

        // 3.1 If type is 'auth', add default fields
        if (type === 'auth') {
            await collectionRepository.addField(project.name, physicalName, 'email', 'text', false)
            await collectionRepository.addField(project.name, physicalName, 'password', 'text', false)
            await collectionRepository.addField(project.name, physicalName, 'name', 'text', true)
            // We use text array for roles, but addField doesn't support array types directly yet based on my read.
            // Let's check addField implementation again. It maps 'text', 'integer', 'boolean'.
            // For now, let's use a raw query or update addField. 
            // Actually, waiting for addField update might be safer, but for now let's assume we can add it manually or use text.
            // Re-checking collectionRepository.addField... it maps strictly.
            // We should probably update addField to support arrays or use a direct query here.
            // Let's use direct query for roles for now to match old schema, as addField is limited.
            const targetDb = await connectionManager.getConnection(project.name)
            if (targetDb) {
                await targetDb.execute(sql.raw(`ALTER TABLE "${physicalName}" ADD COLUMN "roles" TEXT[] DEFAULT '{"user"}'`))
            }

            // Email should be unique
            await collectionRepository.createIndex(project.name, physicalName, `${physicalName}_email_idx`, ['email'], true)
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

        return await collectionRepository.listPhysicalTables(project.name, project.prefix, projectId)
    },

    getDetail: async (projectId: number, collectionName: string) => {
        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found')

        const physicalName = `${project.prefix}p${projectId}_${collectionName}`.toLowerCase()
        const exists = await collectionRepository.checkPhysicalTableExists(project.name, physicalName)

        if (!exists) throw new Error('Collection not found')

        const fields = await collectionRepository.getFields(project.name, physicalName)
        const indexes = await collectionRepository.getIndexes(project.name, physicalName)
        const type = await collectionRepository.getCollectionType(project.name, physicalName)

        return {
            meta: { projectId, name: collectionName, physicalName, type },
            fields,
            indexes
        }
    },

    // Field Management
    addField: async (projectId: number, collectionName: string, fieldName: string, type: string, isNullable: boolean) => {
        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found')

        const physicalName = `${project.prefix}p${projectId}_${collectionName}`.toLowerCase()
        const exists = await collectionRepository.checkPhysicalTableExists(project.name, physicalName)
        if (!exists) throw new Error('Collection not found')

        await collectionRepository.addField(project.name, physicalName, fieldName, type, isNullable)
    },

    removeField: async (projectId: number, collectionName: string, fieldName: string) => {
        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found')

        const physicalName = `${project.prefix}p${projectId}_${collectionName}`.toLowerCase()
        const exists = await collectionRepository.checkPhysicalTableExists(project.name, physicalName)
        if (!exists) throw new Error('Collection not found')

        await collectionRepository.removeField(project.name, physicalName, fieldName)
    },

    renameField: async (projectId: number, collectionName: string, oldName: string, newName: string) => {
        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found')

        const physicalName = `${project.prefix}p${projectId}_${collectionName}`.toLowerCase()
        const exists = await collectionRepository.checkPhysicalTableExists(project.name, physicalName)
        if (!exists) throw new Error('Collection not found')

        await collectionRepository.renameField(project.name, physicalName, oldName, newName)
    },

    // Index Management
    createIndex: async (projectId: number, collectionName: string, indexName: string, fields: string[], unique: boolean) => {
        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found')

        const physicalName = `${project.prefix}p${projectId}_${collectionName}`.toLowerCase()
        const exists = await collectionRepository.checkPhysicalTableExists(project.name, physicalName)
        if (!exists) throw new Error('Collection not found')

        const fullIndexName = `${project.prefix}idx_${physicalName}_${indexName}`
        await collectionRepository.createIndex(project.name, physicalName, fullIndexName, fields, unique)
        return fullIndexName
    },

    removeIndex: async (projectId: number, collectionName: string, indexName: string) => {
        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found')

        const physicalName = `${project.prefix}p${projectId}_${collectionName}`.toLowerCase()
        const exists = await collectionRepository.checkPhysicalTableExists(project.name, physicalName)
        if (!exists) throw new Error('Collection not found')

        const fullIndexName = `${project.prefix}idx_${physicalName}_${indexName}`
        await collectionRepository.removeIndex(project.name, fullIndexName)
        return fullIndexName
    }
}
