import { projectRepository } from '@/modules/project/project.repository.js'
import { dataSourceRepository } from '@/modules/datasource/datasource.repository.js'
import { connectionManager } from '@/db/connection-manager.js'
import { sql } from 'drizzle-orm'

export const projectService = {
    create: async (name: string, dataSourceId: number) => {
        const project = await projectRepository.create({ name, dataSourceId })
        await projectService.initializeDataSource(dataSourceId)
        return project
    },
    list: async () => {
        return await projectRepository.findAll()
    },
    getById: async (id: number) => {
        return await projectRepository.findById(id)
    },
    initializeDataSource: async (dataSourceId: number) => {
        // 1. Get Data Source
        const source = await dataSourceRepository.findById(dataSourceId)
        if (!source) throw new Error('Data Source not found')

        // 2. Initialize physical accounts table in the data source
        const targetDb = await connectionManager.getConnection(source.name)
        if (!targetDb) throw new Error('Could not connect to data source')

        await targetDb.execute(sql.raw(`
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `))
    },
    associateDataSource: async (projectId: number, dataSourceId: number) => {
        await projectService.initializeDataSource(dataSourceId)

        // 3. Update project link
        return await projectRepository.update(projectId, { dataSourceId })
    }
}
