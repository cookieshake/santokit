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

        // 4. Save Metadata
        return await collectionRepository.create({
            projectId,
            name,
            physicalName,
            idType
        })
    },

    listByProject: async (projectId: number) => {
        return await collectionRepository.findByProject(projectId)
    },

    getDetail: async (projectId: number, collectionName: string) => {
        const col = await collectionRepository.findByProjectAndName(projectId, collectionName)
        if (!col) throw new Error('Collection not found')

        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found')

        const fields = await collectionRepository.getFields(project.name, col.physicalName)
        const indexes = await collectionRepository.getIndexes(project.name, col.physicalName)

        return { meta: col, fields, indexes }
    },

    // Field Management
    addField: async (projectId: number, collectionName: string, fieldName: string, type: string, isNullable: boolean) => {
        const col = await collectionRepository.findByProjectAndName(projectId, collectionName)
        if (!col) throw new Error('Collection not found')

        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found')

        await collectionRepository.addField(project.name, col.physicalName, fieldName, type, isNullable)
    },

    removeField: async (projectId: number, collectionName: string, fieldName: string) => {
        const col = await collectionRepository.findByProjectAndName(projectId, collectionName)
        if (!col) throw new Error('Collection not found')

        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found')

        await collectionRepository.removeField(project.name, col.physicalName, fieldName)
    },

    renameField: async (projectId: number, collectionName: string, oldName: string, newName: string) => {
        const col = await collectionRepository.findByProjectAndName(projectId, collectionName)
        if (!col) throw new Error('Collection not found')

        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found')

        await collectionRepository.renameField(project.name, col.physicalName, oldName, newName)
    },

    // Index Management
    createIndex: async (projectId: number, collectionName: string, indexName: string, fields: string[], unique: boolean) => {
        const col = await collectionRepository.findByProjectAndName(projectId, collectionName)
        if (!col) throw new Error('Collection not found')

        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found')

        const fullIndexName = `${project.prefix}idx_${col.physicalName}_${indexName}`
        await collectionRepository.createIndex(project.name, col.physicalName, fullIndexName, fields, unique)
        return fullIndexName
    },

    removeIndex: async (projectId: number, collectionName: string, indexName: string) => {
        const col = await collectionRepository.findByProjectAndName(projectId, collectionName)
        if (!col) throw new Error('Collection not found')

        const project = await projectRepository.findById(projectId)
        if (!project) throw new Error('Project not found')

        const fullIndexName = `${project.prefix}idx_${col.physicalName}_${indexName}`
        await collectionRepository.removeIndex(project.name, fullIndexName)
        return fullIndexName
    }
}
