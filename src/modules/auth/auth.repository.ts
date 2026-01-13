import { db } from '@/db/index.js'
import { users } from '@/db/schema.js'
import { eq } from 'drizzle-orm'

export class AuthRepository {
    async create(data: any) {
        const [result] = await db.insert(users).values(data).returning()
        return result
    }

    async findByEmail(email: string) {
        const [result] = await db.select().from(users).where(eq(users.email, email))
        return result
    }

    async findById(id: number) {
        const [result] = await db.select().from(users).where(eq(users.id, id))
        return result
    }
}

export const authRepository = new AuthRepository()
