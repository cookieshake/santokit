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
    }
}
