import { collectionRepository } from '@/modules/collection/collection.repository.js'
import { dataSourceRepository } from '@/modules/datasource/datasource.repository.js'
import { projectRepository } from '@/modules/project/project.repository.js'

export const collectionService = {
    create: async (projectId: number, name: string, idType: 'serial' | 'uuid' = 'serial') => {
        // 1. Get Project and its Data Source
        const project = await projectRepository.findById(projectId)
        if (!project || !project.dataSourceId) throw new Error('Project not associated with a data source')

        const source = await dataSourceRepository.findById(project.dataSourceId)
        if (!source) throw new Error('Data Source not found')

        // 2. Generate Physical Name
        const physicalName = `${source.prefix}p${projectId}_${name}`.toLowerCase()

        // 3. Create Physical Table
        await collectionRepository.createPhysicalTable(source.name, physicalName, idType)

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
        if (!project || !project.dataSourceId) throw new Error('Project not associated with a data source')

        const source = await dataSourceRepository.findById(project.dataSourceId)
        if (!source) throw new Error('Data Source not found')

        const fields = await collectionRepository.getFields(source.name, col.physicalName)
        const indexes = await collectionRepository.getIndexes(source.name, col.physicalName)

        return { meta: col, fields, indexes }
    },

    // Field Management
    addField: async (projectId: number, collectionName: string, fieldName: string, type: string, isNullable: boolean) => {
        const col = await collectionRepository.findByProjectAndName(projectId, collectionName)
        if (!col) throw new Error('Collection not found')

        const project = await projectRepository.findById(projectId)
        if (!project || !project.dataSourceId) throw new Error('Project not associated with a data source')

        const source = await dataSourceRepository.findById(project.dataSourceId)
        if (!source) throw new Error('Data Source not found')

        await collectionRepository.addField(source.name, col.physicalName, fieldName, type, isNullable)
    },

    removeField: async (projectId: number, collectionName: string, fieldName: string) => {
        const col = await collectionRepository.findByProjectAndName(projectId, collectionName)
        if (!col) throw new Error('Collection not found')

        const project = await projectRepository.findById(projectId)
        if (!project || !project.dataSourceId) throw new Error('Project not associated with a data source')

        const source = await dataSourceRepository.findById(project.dataSourceId)
        if (!source) throw new Error('Data Source not found')

        await collectionRepository.removeField(source.name, col.physicalName, fieldName)
    },

    renameField: async (projectId: number, collectionName: string, oldName: string, newName: string) => {
        const col = await collectionRepository.findByProjectAndName(projectId, collectionName)
        if (!col) throw new Error('Collection not found')

        const project = await projectRepository.findById(projectId)
        if (!project || !project.dataSourceId) throw new Error('Project not associated with a data source')

        const source = await dataSourceRepository.findById(project.dataSourceId)
        if (!source) throw new Error('Data Source not found')

        await collectionRepository.renameField(source.name, col.physicalName, oldName, newName)
    },

    // Index Management
    createIndex: async (projectId: number, collectionName: string, indexName: string, fields: string[], unique: boolean) => {
        const col = await collectionRepository.findByProjectAndName(projectId, collectionName)
        if (!col) throw new Error('Collection not found')

        const project = await projectRepository.findById(projectId)
        if (!project || !project.dataSourceId) throw new Error('Project not associated with a data source')

        const source = await dataSourceRepository.findById(project.dataSourceId)
        if (!source) throw new Error('Data Source not found')

        const fullIndexName = `${source.prefix}idx_${col.physicalName}_${indexName}`
        await collectionRepository.createIndex(source.name, col.physicalName, fullIndexName, fields, unique)
        return fullIndexName
    },

    removeIndex: async (projectId: number, collectionName: string, indexName: string) => {
        const col = await collectionRepository.findByProjectAndName(projectId, collectionName)
        if (!col) throw new Error('Collection not found')

        const project = await projectRepository.findById(projectId)
        if (!project || !project.dataSourceId) throw new Error('Project not associated with a data source')

        const source = await dataSourceRepository.findById(project.dataSourceId)
        if (!source) throw new Error('Data Source not found')

        const fullIndexName = `${source.prefix}idx_${col.physicalName}_${indexName}`
        await collectionRepository.removeIndex(source.name, fullIndexName)
        return fullIndexName
    }
}
