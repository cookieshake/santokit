
import { connectionManager } from '@/db/connection-manager.js'
import { collectionService } from '@/modules/collection/collection.service.js'
import { dataRepository } from './data.repository.js'
import { Kysely } from 'kysely'

export class DataClient {
    private constructor(
        private db: Kysely<any>,
        private physicalName: string
    ) { }

    static async create(databaseId: string, collectionName: string) {
        // 1. Resolve Physical Name
        const detail = await collectionService.getDetail(databaseId, collectionName)
        const physicalName = detail.meta.physical_name

        // 2. Resolve Database Connection
        const db = await connectionManager.getConnection(databaseId)
        if (!db) {
            throw new Error(`Could not connect to database ${databaseId}`)
        }

        return new DataClient(db, physicalName)
    }

    async create(data: Record<string, any>) {
        return dataRepository.create(this.db, this.physicalName, data)
    }

    async findAll(whereClause?: string | null) {
        return dataRepository.findAll(this.db, this.physicalName, whereClause)
    }

    async update(id: string, data: Record<string, any>, whereClause?: string | null) {
        return dataRepository.update(this.db, this.physicalName, id, data, whereClause)
    }

    async delete(id: string, whereClause?: string | null) {
        return dataRepository.delete(this.db, this.physicalName, id, whereClause)
    }
}
