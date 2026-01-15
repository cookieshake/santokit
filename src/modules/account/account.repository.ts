import { connectionManager } from '@/db/connection-manager.js'
import { dataSourceRepository } from '@/modules/datasource/datasource.repository.js'
import { projectRepository } from '@/modules/project/project.repository.js'
import { sql } from 'drizzle-orm'
import { db } from '@/db/index.js'

export const accountRepository = {
    async getDbForProject(projectId: number | string) {
        if (projectId === 'system') {
            return db
        }

        const project = await projectRepository.findById(projectId as number)
        if (!project || !project.dataSourceId) throw new Error('Project not associated with a data source')

        const source = await dataSourceRepository.findById(project.dataSourceId)
        if (!source) throw new Error('Data Source not found')

        const targetDb = await connectionManager.getConnection(source.name)
        if (!targetDb) throw new Error('Could not connect to data source')

        return targetDb
    },

    create: async (projectId: number | string, data: any) => {
        const db = await accountRepository.getDbForProject(projectId)
        const fullData = {
            id: typeof crypto !== 'undefined' ? crypto.randomUUID() : Math.random().toString(36).substring(2),
            name: data.email, // default name
            email_verified: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...data
        }
        const keys = Object.keys(fullData)
        const cols = keys.map(k => `"${k}"`).join(', ')
        const vals = keys.map(k => {
            const v = (fullData as any)[k]
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
            if (Array.isArray(v)) {
                const arrVals = v.map(item => typeof item === 'string' ? `"${item.replace(/"/g, '\\"')}"` : item).join(',')
                return `'${"{" + arrVals + "}"}'`
            }
            return v
        }).join(', ')

        const query = `INSERT INTO "accounts" (${cols}) VALUES (${vals}) RETURNING *`
        const result = await db.execute(sql.raw(query))
        return result.rows[0]
    },

    findByProjectId: async (projectId: number | string) => {
        const db = await accountRepository.getDbForProject(projectId)
        const result = await db.execute(sql.raw(`SELECT * FROM "accounts"`))
        return result.rows
    },

    findById: async (projectId: number | string, id: number | string) => {
        const db = await accountRepository.getDbForProject(projectId)
        const val = typeof id === 'string' ? `'${id.replace(/'/g, "''")}'` : id
        const result = await db.execute(sql.raw(`SELECT * FROM "accounts" WHERE id = ${val}`))
        return result.rows[0]
    },

    findByEmail: async (projectId: number | string, email: string) => {
        const db = await accountRepository.getDbForProject(projectId)
        const result = await db.execute(sql.raw(`SELECT * FROM "accounts" WHERE email = '${email.replace(/'/g, "''")}'`))
        return result.rows[0]
    },

    delete: async (projectId: number | string, id: number | string) => {
        const db = await accountRepository.getDbForProject(projectId)
        const val = typeof id === 'string' ? `'${id.replace(/'/g, "''")}'` : id
        await db.execute(sql.raw(`DELETE FROM "accounts" WHERE id = ${val}`))
    }
}
