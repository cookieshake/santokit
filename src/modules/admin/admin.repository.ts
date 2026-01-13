import { db } from '@/db/index.js'
import { admins } from '@/db/schema.js'
import { eq } from 'drizzle-orm'

export class AdminRepository {
    async create(data: any) {
        const [result] = await db.insert(admins).values(data).returning()
        return result
    }

    async findByEmail(email: string) {
        const [result] = await db.select().from(admins).where(eq(admins.email, email))
        return result
    }

    async findById(id: number) {
        const [result] = await db.select().from(admins).where(eq(admins.id, id))
        return result
    }
}

export const adminRepository = new AdminRepository()
