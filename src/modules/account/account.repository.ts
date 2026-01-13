import { db } from '@/db/index.js'
import { accounts } from '@/db/schema.js'
import { eq, and } from 'drizzle-orm'

export class AccountRepository {
    async create(projectId: number, data: any) {
        const [result] = await db.insert(accounts).values({
            projectId,
            ...data
        }).returning()
        return result
    }

    async findByProjectId(projectId: number) {
        return db.select().from(accounts).where(eq(accounts.projectId, projectId))
    }

    async findById(id: number) {
        const [result] = await db.select().from(accounts).where(eq(accounts.id, id))
        return result
    }

    async delete(id: number) {
        await db.delete(accounts).where(eq(accounts.id, id))
    }
}

export const accountRepository = new AccountRepository()
