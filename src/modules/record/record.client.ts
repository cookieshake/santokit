
import { connectionManager } from '@/db/connection-manager.js'
import { collectionService } from '@/modules/collection/collection.service.js'
import { recordRepository } from './record.repository.js'
import { Kysely } from 'kysely'

export class RecordClient {
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

        return new RecordClient(db, physicalName)
    }

    async create(data: Record<string, any>) {
        return recordRepository.create(this.db, this.physicalName, data)
    }

    async findAll(whereClause?: string | null) {
        return recordRepository.findAll(this.db, this.physicalName, whereClause)
    }

    async update(id: string, data: Record<string, any>, whereClause?: string | null) {
        return recordRepository.update(this.db, this.physicalName, id, data, whereClause)
    }

    async delete(id: string, whereClause?: string | null) {
        return recordRepository.delete(this.db, this.physicalName, id, whereClause)
    }
}
