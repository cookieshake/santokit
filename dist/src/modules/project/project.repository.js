import { db } from '@/db/index.js';
import { projects } from '@/db/schema.js';
import { eq } from 'drizzle-orm';
export const projectRepository = {
    create: async (data) => {
        const result = await db.insert(projects).values(data).returning();
        return result[0];
    },
    findAll: async () => {
        return await db.select().from(projects);
    },
    findById: async (id) => {
        return await db.query.projects.findFirst({
            where: eq(projects.id, id)
        });
    }
};
