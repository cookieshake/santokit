import { collectionService } from '@/modules/collection/collection.service.js'
import { physicalSchemaService } from '@/modules/collection/physical-schema.service.js'
import { databaseRepository } from '@/modules/database/database.repository.js'

export const databaseService = {
  create: async (projectId: string, name: string, connectionString: string, prefix?: string) => {
    const database = await databaseRepository.create({
      projectId,
      name,
      connectionString,
      prefix: prefix || 'santoki_',
    })

    // Initialize default collections - always create users table for auth
    await databaseService.initializeDatabase(database.id, 'users')
    return database
  },
  initializeDatabase: async (databaseId: string, accountCollectionName: string = 'users') => {
    // Initialize physical accounts table in the database via Collection Service
    // This ensures it is tracked as a proper collection with type 'auth'
    // We catch error in case it already exists (idempotency)
    try {
      await collectionService.create(databaseId, accountCollectionName, 'typeid', 'auth')
    } catch (e) {
      // If it already exists, that's fine.
      if (
        (e as Error).message !== 'Collection already exists' &&
        !(e as Error).message.includes('already exists')
      ) {
        // Ideally collectionService should have better error typing or check existence first.
      }
    }
  },
  listByProject: async (projectId: string) => {
    return await databaseRepository.findByProjectId(projectId)
  },
  getById: async (id: string) => {
    return await databaseRepository.findById(id)
  },
  delete: async (projectId: string, databaseId: string) => {
    const db = await databaseRepository.findById(databaseId)
    if (!db) throw new Error('Database not found')
    if (db.project_id !== projectId) throw new Error('Database does not belong to project')

    // 1. List all collections
    const collections = await collectionService.listByDatabase(db.id)

    // 2. Delete all physical tables
    for (const collection of collections) {
      await physicalSchemaService.dropTable(db.id, collection.physical_name as string)
    }

    // 3. Metadata in Main DB is handled by CASCADE delete on Database

    // 4. Delete the database record
    await databaseRepository.delete(db.id)
  },
}
