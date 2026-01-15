import { projectRepository } from '@/modules/project/project.repository.js'
import { connectionManager } from '@/db/connection-manager.js'
import { sql } from 'drizzle-orm'

export const projectService = {
    create: async (name: string, connectionString: string, prefix?: string) => {
        const project = await projectRepository.create({ name, connectionString, prefix: prefix || 'santoki_' })
        await projectService.initializeDataSource(project.name)
        return project
    },
    list: async () => {
        return await projectRepository.findAll()
    },
    getById: async (id: number) => {
        return await projectRepository.findById(id)
    },
    initializeDataSource: async (name: string) => {
        // 2. Initialize physical accounts table in the data source
        const targetDb = await connectionManager.getConnection(name)
        if (!targetDb) throw new Error('Could not connect to data source')

        await targetDb.execute(sql.raw(`
            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `))
    }
}
