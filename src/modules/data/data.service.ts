import { collectionService } from '@/modules/collection/collection.service.js'
import { connectionManager } from '@/db/connection-manager.js'
import { dataRepository } from './data.repository.js'
import { DataClient } from './data.client.js'

export const dataService = {
    create: async (databaseId: string, collectionName: string, data: Record<string, any>) => {
        const client = await DataClient.create(databaseId, collectionName)
        return client.create(data)
    },

    findAll: async (databaseId: string, collectionName: string, whereClause?: string | null) => {
        const client = await DataClient.create(databaseId, collectionName)
        return client.findAll(whereClause)
    },

    update: async (databaseId: string, collectionName: string, id: string, data: Record<string, any>, whereClause?: string | null) => {
        const client = await DataClient.create(databaseId, collectionName)
        return client.update(id, data, whereClause)
    },

    delete: async (databaseId: string, collectionName: string, id: string, whereClause?: string | null) => {
        const client = await DataClient.create(databaseId, collectionName)
        return client.delete(id, whereClause)
    }
}
