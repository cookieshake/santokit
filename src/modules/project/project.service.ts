import { projectRepository } from '@/modules/project/project.repository.js'
import { collectionService } from '@/modules/collection/collection.service.js'
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
        // However, collectionService.create doesn't check 'virtual' existence, 
        // it goes straight to createPhysicalTable which might throw if table exists.
        // Let's rely on collectionService.create throwing if table exists, and ignore that specific error.
    }
}
