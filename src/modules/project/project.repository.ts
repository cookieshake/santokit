import { db } from '@/db/index.js'

export const projectRepository = {
    create: async (data: { name: string }) => {
        const result = await db
            .insertInto('projects')
            .values(data)
            .returningAll()
            .executeTakeFirstOrThrow()
        return result
    },
    findAll: async () => {
        return await db.selectFrom('projects').selectAll().execute()
    },
    findById: async (id: number) => {
        return await db
            .selectFrom('projects')
            .selectAll()
            .where('id', '=', id)
            .executeTakeFirst()
    },
    update: async (id: number, data: { name?: string }) => {
        const result = await db
            .updateTable('projects')
            .set(data)
            .where('id', '=', id)
            .returningAll()
            .executeTakeFirst()
        return result
    },
    delete: async (id: number) => {
        await db.deleteFrom('projects').where('id', '=', id).execute()
    },

    // Database Methods
    createDatabase: async (data: { projectId: number; name: string; connectionString: string; prefix?: string }) => {
        const result = await db
            .insertInto('databases')
            .values({
                project_id: data.projectId,
                name: data.name,
                connection_string: data.connectionString,
                prefix: data.prefix || 'santoki_'
            })
            .returningAll()
            .executeTakeFirstOrThrow()
        return result
    },
    findDatabasesByProjectId: async (projectId: number) => {
        return await db
            .selectFrom('databases')
            .selectAll()
            .where('project_id', '=', projectId)
            .execute()
    },
    findDatabaseById: async (id: number) => {
        return await db
            .selectFrom('databases')
            .selectAll()
            .where('id', '=', id)
            .executeTakeFirst()
    },
    findDatabaseByName: async (projectId: number, name: string) => {
        return await db
            .selectFrom('databases')
            .selectAll()
            .where('project_id', '=', projectId)
            .where('name', '=', name)
            .executeTakeFirst()
    },
    deleteDatabase: async (id: number) => {
        await db.deleteFrom('databases').where('id', '=', id).execute()
    }
}
