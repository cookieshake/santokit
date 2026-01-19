import { db } from '@/db/index.js'
import { typeid } from 'typeid-js'

export const databaseRepository = {
    create: async (data: { projectId: string; name: string; connectionString: string; prefix?: string }) => {
        const result = await db
            .insertInto('databases')
            .values({
                id: typeid('db').toString(),
                project_id: data.projectId,
                name: data.name,
                connection_string: data.connectionString,
                prefix: data.prefix || 'santoki_'
            })
            .returningAll()
            .executeTakeFirstOrThrow()
        return result
    },
    findByProjectId: async (projectId: string) => {
        return await db
            .selectFrom('databases')
            .selectAll()
            .where('project_id', '=', projectId)
            .execute()
    },
    findById: async (id: string) => {
        return await db
            .selectFrom('databases')
            .selectAll()
            .where('id', '=', id)
            .executeTakeFirst()
    },
    findByName: async (projectId: string, name: string) => {
        return await db
            .selectFrom('databases')
            .selectAll()
            .where('project_id', '=', projectId)
            .where('name', '=', name)
            .executeTakeFirst()
    },
    delete: async (id: string) => {
        await db.deleteFrom('databases').where('id', '=', id).execute()
    }
}
