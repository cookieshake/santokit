import { collectionService } from '@/modules/collection/collection.service.js'
import { connectionManager } from '@/db/connection-manager.js'
import { dataRepository } from './data.repository.js'

export const dataService = {
    create: async (databaseId: string, collectionName: string, data: Record<string, any>) => {
        const detail = await collectionService.getDetail(databaseId, collectionName)
        const physicalName = detail.meta.physical_name

        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        return dataRepository.create(targetDb, physicalName, data)
    },

    findAll: async (databaseId: string, collectionName: string, whereClause?: string | null) => {
        const detail = await collectionService.getDetail(databaseId, collectionName)
        const physicalName = detail.meta.physical_name

        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        return dataRepository.findAll(targetDb, physicalName, whereClause)
    },

    update: async (databaseId: string, collectionName: string, id: string, data: Record<string, any>, whereClause?: string | null) => {
        const detail = await collectionService.getDetail(databaseId, collectionName)
        const physicalName = detail.meta.physical_name

        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        return dataRepository.update(targetDb, physicalName, id, data, whereClause)
    },

    delete: async (databaseId: string, collectionName: string, id: string, whereClause?: string | null) => {
        const detail = await collectionService.getDetail(databaseId, collectionName)
        const physicalName = detail.meta.physical_name

        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        return dataRepository.delete(targetDb, physicalName, id, whereClause)
    }
}
