import { db } from '@/db/index.js'
import { users } from '@/db/schema.js'
import { eq, and, arrayContains } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

export class AdminRepository {
    async create(data: any) {
        const [result] = await db.insert(users).values({
            ...data,
            roles: ['admin'], // Force admin for now as per requirement
            id: randomUUID(), // users table needs string ID
            createdAt: new Date(),
            updatedAt: new Date(),
            emailVerified: false,
        }).returning()
        return result
    }

    async findByEmail(email: string) {
        const [result] = await db.select().from(users).where(and(eq(users.email, email), arrayContains(users.roles, ['admin'])))
        return result
    }

    async findById(id: string) {
        const [result] = await db.select().from(users).where(and(eq(users.id, id), arrayContains(users.roles, ['admin'])))
        return result
    }
}

export const adminRepository = new AdminRepository()
