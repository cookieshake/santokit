import { collectionRepository } from '@/modules/collection/collection.repository.js'
// dataSourceRepository import removed
import { projectRepository } from '@/modules/project/project.repository.js'

export const collectionService = {
    create: async (projectId: number, name: string, idType: 'serial' | 'uuid' = 'serial') => {
        // 1. Get Project
        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found') // removed dataSource check

        // 2. Generate Physical Name
        const physicalName = `${project.prefix}p${projectId}_${name}`.toLowerCase()

        // 3. Create Physical Table
        await collectionRepository.createPhysicalTable(project.name, physicalName, idType)

        // 4. Return "Virtual" Collection Object
        return {
            projectId,
            name,
            physicalName,
            idType
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

        return {
            meta: { projectId, name: collectionName, physicalName },
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
