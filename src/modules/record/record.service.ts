import { connectionManager } from '@/db/connection-manager.js'
import { collectionService } from '@/modules/collection/collection.service.js'

import { RecordClient } from './record.client.js'
import { recordRepository } from './record.repository.js'

export const recordService = {
  create: async (databaseId: string, collectionName: string, data: Record<string, any>) => {
    const client = await RecordClient.create(databaseId, collectionName)
    return client.create(data)
  },

  findAll: async (databaseId: string, collectionName: string, whereClause?: string | null) => {
    const client = await RecordClient.create(databaseId, collectionName)
    return client.findAll(whereClause)
  },

  update: async (
    databaseId: string,
    collectionName: string,
    id: string,
    data: Record<string, any>,
    whereClause?: string | null,
  ) => {
    const client = await RecordClient.create(databaseId, collectionName)
    return client.update(id, data, whereClause)
  },

  delete: async (
    databaseId: string,
    collectionName: string,
    id: string,
    whereClause?: string | null,
  ) => {
    const client = await RecordClient.create(databaseId, collectionName)
    return client.delete(id, whereClause)
  },
}
