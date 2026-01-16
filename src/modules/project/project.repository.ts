import { db } from '@/db/index.js'
import { projects, databases } from '@/db/schema.js'
import { eq, and } from 'drizzle-orm'

export const projectRepository = {
    create: async (data: typeof projects.$inferInsert) => {
        const result = await db.insert(projects).values(data).returning()
        return result[0]
    },
    findAll: async () => {
        return await db.select().from(projects)
    },
    findById: async (id: number) => {
        return await db.query.projects.findFirst({
            where: eq(projects.id, id)
        })
    },
    update: async (id: number, data: Partial<typeof projects.$inferInsert>) => {
        const result = await db.update(projects).set(data).where(eq(projects.id, id)).returning()
        return result[0]
    },
    delete: async (id: number) => {
        await db.delete(projects).where(eq(projects.id, id))
    },

    // Database Methods
    createDatabase: async (data: typeof databases.$inferInsert) => {
        const result = await db.insert(databases).values(data).returning()
        return result[0]
    },
    findDatabasesByProjectId: async (projectId: number) => {
        return await db.query.databases.findMany({
            where: eq(databases.projectId, projectId)
        })
    },
    findDatabaseById: async (id: number) => {
        return await db.query.databases.findFirst({
            where: eq(databases.id, id)
        })
    },
    findDatabaseByName: async (projectId: number, name: string) => {
        return await db.query.databases.findFirst({
            where: and(eq(databases.projectId, projectId), eq(databases.name, name))
        })
    }
}
