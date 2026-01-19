import { db } from '@/db/index.js'
import { typeid } from 'typeid-js'

export const projectRepository = {
    create: async (data: { name: string }) => {
        const result = await db
            .insertInto('projects')
            .values({
                ...data,
                id: typeid('proj').toString()
            })
            .returningAll()
            .executeTakeFirstOrThrow()
        return result
    },
    findAll: async () => {
        return await db.selectFrom('projects').selectAll().execute()
    },
    findById: async (id: string) => {
        return await db
            .selectFrom('projects')
            .selectAll()
            .where('id', '=', id)
            .executeTakeFirst()
    },
    update: async (id: string, data: { name?: string }) => {
        const result = await db
            .updateTable('projects')
            .set(data)
            .where('id', '=', id)
            .returningAll()
            .executeTakeFirst()
        return result
    },
    delete: async (id: string) => {
        await db.deleteFrom('projects').where('id', '=', id).execute()
    },

    // Database Methods
    createDatabase: async (data: { projectId: string; name: string; connectionString: string; prefix?: string }) => {
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
    findDatabasesByProjectId: async (projectId: string) => {
        return await db
            .selectFrom('databases')
            .selectAll()
            .where('project_id', '=', projectId)
            .execute()
    },
    findDatabaseById: async (id: string) => {
        return await db
            .selectFrom('databases')
            .selectAll()
            .where('id', '=', id)
            .executeTakeFirst()
    },
    findDatabaseByName: async (projectId: string, name: string) => {
        return await db
            .selectFrom('databases')
            .selectAll()
            .where('project_id', '=', projectId)
            .where('name', '=', name)
            .executeTakeFirst()
    },
    deleteDatabase: async (id: string) => {
        await db.deleteFrom('databases').where('id', '=', id).execute()
    }
}
