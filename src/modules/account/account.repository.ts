import { connectionManager } from '@/db/connection-manager.js'
import { dataSourceRepository } from '@/modules/datasource/datasource.repository.js'
import { projectRepository } from '@/modules/project/project.repository.js'
import { sql } from 'drizzle-orm'

export const accountRepository = {
    async getDbForProject(projectId: number) {
        const project = await projectRepository.findById(projectId)
        if (!project || !project.dataSourceId) throw new Error('Project not associated with a data source')

        const source = await dataSourceRepository.findById(project.dataSourceId)
        if (!source) throw new Error('Data Source not found')

        const targetDb = await connectionManager.getConnection(source.name)
        if (!targetDb) throw new Error('Could not connect to data source')

        return targetDb
    },

    create: async (projectId: number, data: any) => {
        const db = await accountRepository.getDbForProject(projectId)
        const keys = Object.keys(data)
        const cols = keys.map(k => `"${k}"`).join(', ')
        const vals = keys.map(k => {
            const v = data[k]
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
            return v
        }).join(', ')

        const query = `INSERT INTO "accounts" (${cols}) VALUES (${vals}) RETURNING *`
        const result = await db.execute(sql.raw(query))
        return result.rows[0]
    },

    findByProjectId: async (projectId: number) => {
        const db = await accountRepository.getDbForProject(projectId)
        const result = await db.execute(sql.raw(`SELECT * FROM "accounts"`))
        return result.rows
    },

    findById: async (projectId: number, id: number) => {
        const db = await accountRepository.getDbForProject(projectId)
        const result = await db.execute(sql.raw(`SELECT * FROM "accounts" WHERE id = ${id}`))
        return result.rows[0]
    },

    findByEmail: async (projectId: number, email: string) => {
        const db = await accountRepository.getDbForProject(projectId)
        const result = await db.execute(sql.raw(`SELECT * FROM "accounts" WHERE email = '${email.replace(/'/g, "''")}'`))
        return result.rows[0]
    },

    delete: async (projectId: number, id: number) => {
        const db = await accountRepository.getDbForProject(projectId)
        await db.execute(sql.raw(`DELETE FROM "accounts" WHERE id = ${id}`))
    }
}
