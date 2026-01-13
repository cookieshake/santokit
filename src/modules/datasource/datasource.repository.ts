import { db } from '@/db/index.js'
import { dataSources } from '@/db/schema.js'
import { eq } from 'drizzle-orm'

export const dataSourceRepository = {
    create: async (data: typeof dataSources.$inferInsert) => {
        const result = await db.insert(dataSources).values(data).returning()
        return result[0]
    },
    findAll: async () => {
        return await db.select().from(dataSources)
    },
    findById: async (id: number) => {
        return await db.query.dataSources.findFirst({
            where: eq(dataSources.id, id)
        })
    },
    findByName: async (name: string) => {
        return await db.query.dataSources.findFirst({
            where: eq(dataSources.name, name)
        })
    }
}
