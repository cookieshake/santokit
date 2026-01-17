import { projectRepository } from '@/modules/project/project.repository.js'
import { collectionService } from '@/modules/collection/collection.service.js'
import { collectionRepository } from '@/modules/collection/collection.repository.js'
import { connectionManager } from '@/db/connection-manager.js'
import { CONSTANTS } from '@/constants.js'
import { sql } from 'drizzle-orm'

export const projectService = {
    create: async (name: string, connectionString?: string, prefix?: string, databaseName?: string) => {
        // 1. Create Project
        const project = await projectRepository.create({ name })

        if (connectionString) {
            // 2. Create Default Database (formerly DataSource)
            const database = await projectRepository.createDatabase({
                projectId: project.id,
                name: databaseName || 'default',
                connectionString,
                prefix: prefix || 'santoki_'
            })

            if (project.name === CONSTANTS.PROJECTS.SYSTEM_ID) {
                await projectService.initializeDatabase(database.id, 'admins')
            } else {
                await projectService.initializeDatabase(database.id, 'users')
            }
        }
        return project
    },
    createDatabase: async (projectId: number, name: string, connectionString: string, prefix?: string) => {
        const database = await projectRepository.createDatabase({
            projectId,
            name,
            connectionString,
            prefix: prefix || 'santoki_'
        })

        // Initialize default collections if needed, e.g. users table for auth
        // Maybe we make this optional or default true? For now, let's always init users/admins
        const project = await projectRepository.findById(projectId)
        if (project) {
            if (project.name === CONSTANTS.PROJECTS.SYSTEM_ID) {
                await projectService.initializeDatabase(database.id, 'admins')
            } else {
                await projectService.initializeDatabase(database.id, 'users')
            }
        }
        return database
    },
    list: async () => {
        return await projectRepository.findAll()
    },
    getById: async (id: number) => {
        return await projectRepository.findById(id)
    },
    initializeDatabase: async (databaseId: number, accountCollectionName: string = 'users') => {
        // 2. Initialize physical accounts table in the database via Collection Service
        // This ensures it is tracked as a proper collection with type 'auth'
        // We catch error in case it already exists (idempotency)
        try {
            await collectionService.create(databaseId, accountCollectionName, 'uuid', 'auth')
        } catch (e) {
            // If it already exists, that's fine.
            // But we should verify it's a collection creation error and not DB connection error
            if ((e as Error).message !== 'Collection already exists' && !(e as Error).message.includes('already exists')) {
                // Ideally collectionService should have better error typing or check existence first.
            }
        }
    },
    delete: async (id: number, deleteData: boolean) => {
        const project = await projectRepository.findById(id)
        if (!project) throw new Error('Project not found')

        // Prevent system project deletion
        if (project.name === CONSTANTS.PROJECTS.SYSTEM_ID) {
            throw new Error('Cannot delete system project')
        }

        if (deleteData) {
            const databases = await projectRepository.findDatabasesByProjectId(id)

            for (const db of databases) {
                // 1. List all collections
                const collections = await collectionService.listByDatabase(db.id)

                // 2. Delete all physical tables
                const collectionTableName = `${db.prefix}p${id}__collections`.toLowerCase()
                for (const collection of collections) {
                    await collectionRepository.deletePhysicalTable(db.id, collectionTableName, collection.physicalName as string)
                }

                // 3. Delete the _collections table itself
                const targetDb = await connectionManager.getConnection(db.id)
                if (targetDb) {
                    await targetDb.execute(sql.raw(`DROP TABLE IF EXISTS "${collectionTableName}"`))
                }
            }
        }

        await projectRepository.delete(id)
    },
    deleteDatabase: async (projectId: number, databaseId: number) => {
        const db = await projectRepository.findDatabaseById(databaseId)
        if (!db) throw new Error('Database not found')
        if (db.projectId !== projectId) throw new Error('Database does not belong to project')

        // 1. List all collections
        const collections = await collectionService.listByDatabase(db.id)

        // 2. Delete all physical tables
        const collectionTableName = `${db.prefix}p${projectId}__collections`.toLowerCase()
        for (const collection of collections) {
            await collectionRepository.deletePhysicalTable(db.id, collectionTableName, collection.physicalName as string)
        }

        // 3. Delete the _collections table itself
        const targetDb = await connectionManager.getConnection(db.id)
        if (targetDb) {
            await targetDb.execute(sql.raw(`DROP TABLE IF EXISTS "${collectionTableName}"`))
        }

        // 4. Delete the database record
        await projectRepository.deleteDatabase(db.id)
    }
}
