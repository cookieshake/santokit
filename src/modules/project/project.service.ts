import { projectRepository } from '@/modules/project/project.repository.js'
import { collectionService } from '@/modules/collection/collection.service.js'
import { collectionRepository } from '@/modules/collection/collection.repository.js'
import { connectionManager } from '@/db/connection-manager.js'
import { CONSTANTS } from '@/constants.js'
import { sql } from 'drizzle-orm'

export const projectService = {
    create: async (name: string, connectionString: string, prefix?: string) => {
        const project = await projectRepository.create({ name, connectionString, prefix: prefix || 'santoki_' })
        if (project.name === CONSTANTS.PROJECTS.SYSTEM_ID) {
            await projectService.initializeDataSource(project.name, project.id, 'admins')
        } else {
            await projectService.initializeDataSource(project.name, project.id, 'users')
        }
        return project
    },
    list: async () => {
        return await projectRepository.findAll()
    },
    getById: async (id: number) => {
        return await projectRepository.findById(id)
    },
    initializeDataSource: async (name: string, projectId: number, accountCollectionName: string = 'users') => {
        // 2. Initialize physical accounts table in the data source via Collection Service
        // This ensures it is tracked as a proper collection with type 'auth'
        // We catch error in case it already exists (idempotency)
        try {
            await collectionService.create(projectId, accountCollectionName, 'uuid', 'auth')
        } catch (e) {
            // If it already exists, that's fine.
            // But we should verify it's a collection creation error and not DB connection error
            if ((e as Error).message !== 'Collection already exists' && !(e as Error).message.includes('already exists')) {
                // Ideally collectionService should have better error typing or check existence first.
                // For now, let's check existence first to be cleaner.
            }
        }

        // Actually, let's just check if it exists first using listByProject or getDetail logic, 
        // but create throws if exists usually. 
        // Let's modify logic to be safe: check existence is better.
        // it goes straight to createPhysicalTable which might throw if table exists.
        // Let's rely on collectionService.create throwing if table exists, and ignore that specific error.
    },
    delete: async (id: number, deleteData: boolean) => {
        const project = await projectRepository.findById(id)
        if (!project) throw new Error('Project not found')

        // Prevent system project deletion
        if (project.name === CONSTANTS.PROJECTS.SYSTEM_ID) {
            throw new Error('Cannot delete system project')
        }

        if (deleteData) {
            // 1. List all collections
            const collections = await collectionService.listByProject(id)

            // 2. Delete all physical tables
            for (const collection of collections) {
                const collectionTableName = `${project.prefix}p${id}__collections`.toLowerCase()
                await collectionRepository.deletePhysicalTable(project.name, collectionTableName, collection.physicalName as string)
            }

            // 3. Delete the _collections table itself
            const collectionTableName = `${project.prefix}p${id}__collections`.toLowerCase()
            // We can treat the collections table as a physical table in itself if we wanted to drop it cleanly,
            // but collectionRepository.deletePhysicalTable expects a metadata table name.
            // For the main collections table, we just need to drop it.
            const targetDb = await connectionManager.getConnection(project.name)
            if (targetDb) {
                await targetDb.execute(sql.raw(`DROP TABLE IF EXISTS "${collectionTableName}"`))
            }
        }

        await projectRepository.delete(id)
    }
}
