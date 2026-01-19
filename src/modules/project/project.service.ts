import { projectRepository } from '@/modules/project/project.repository.js'
import { collectionService } from '@/modules/collection/collection.service.js'
import { collectionRepository } from '@/modules/collection/collection.repository.js'
import { typeid } from 'typeid-js'

export const projectService = {
    create: async (name: string) => {
        // 1. Create Project
        const project = await projectRepository.create({ name })
        return project
    },
    createDatabase: async (projectId: string, name: string, connectionString: string, prefix?: string) => {
        const database = await projectRepository.createDatabase({
            projectId,
            name,
            connectionString,
            prefix: prefix || 'santoki_'
        })

        // Initialize default collections - always create users table for auth
        await projectService.initializeDatabase(database.id, 'users')
        return database
    },
    list: async () => {
        return await projectRepository.findAll()
    },
    getById: async (id: string) => {
        return await projectRepository.findById(id)
    },
    initializeDatabase: async (databaseId: string, accountCollectionName: string = 'users') => {
        // Initialize physical accounts table in the database via Collection Service
        // This ensures it is tracked as a proper collection with type 'auth'
        // We catch error in case it already exists (idempotency)
        try {
            await collectionService.create(databaseId, accountCollectionName, 'typeid', 'auth')
        } catch (e) {
            // If it already exists, that's fine.
            if ((e as Error).message !== 'Collection already exists' && !(e as Error).message.includes('already exists')) {
                // Ideally collectionService should have better error typing or check existence first.
            }
        }
    },
    delete: async (id: string, deleteData: boolean) => {
        const project = await projectRepository.findById(id)
        if (!project) throw new Error('Project not found')

        if (deleteData) {
            const databases = await projectRepository.findDatabasesByProjectId(id)

            for (const db of databases) {
                // 1. List all collections
                const collections = await collectionService.listByDatabase(db.id)

                // 2. Delete all physical tables
                for (const collection of collections) {
                    await collectionRepository.deletePhysicalTable(db.id, collection.physical_name as string)
                }

                // 3. Metadata in Main DB is handled by CASCADE delete on Project
            }
        }

        await projectRepository.delete(id)
    },
    deleteDatabase: async (projectId: string, databaseId: string) => {
        const db = await projectRepository.findDatabaseById(databaseId)
        if (!db) throw new Error('Database not found')
        if (db.project_id !== projectId) throw new Error('Database does not belong to project')

        // 1. List all collections
        const collections = await collectionService.listByDatabase(db.id)

        // 2. Delete all physical tables
        for (const collection of collections) {
            await collectionRepository.deletePhysicalTable(db.id, collection.physical_name as string)
        }

        // 3. Metadata in Main DB is handled by CASCADE delete on Database

        // 4. Delete the database record
        await projectRepository.deleteDatabase(db.id)
    }
}
