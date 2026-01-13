import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { authService } from './auth.service.js'
import { db } from '@/db/index.js'
import { users } from '@/db/schema.js'
import { sql } from 'drizzle-orm'

vi.mock('../../db/index.js', async () => {
    const { PGlite } = await import('@electric-sql/pglite')
    const { drizzle } = await import('drizzle-orm/pglite')
    const schema = await import('../../db/schema.js')
    const pglite = new PGlite()
    const db = drizzle(pglite, { schema })
    return { db, pglite }
})

const { db: mockedDb, pglite } = await import('@/db/index.js') as any
const pgliteInstance = pglite as any

describe('Auth Module (System Users/Admins)', () => {
    beforeEach(async () => {
        // Table creation
        await pgliteInstance.exec(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
        `)

        // Clear tables
        await mockedDb.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
    })

    it('should register a new admin user', async () => {
        const user = await authService.register({
            email: 'admin@example.com',
            password: 'password123'
        })
        expect(user.email).toBe('admin@example.com')
        expect(user.role).toBe('admin')
    })

    it('should NOT allow registering duplicate email', async () => {
        await authService.register({
            email: 'admin@example.com',
            password: 'password123'
        })
        await expect(authService.register({
            email: 'admin@example.com',
            password: 'passother'
        })).rejects.toThrow()
    })

    it('should login and return a token', async () => {
        await authService.register({
            email: 'admin@example.com',
            password: 'password123'
        })
        const result = await authService.login('admin@example.com', 'password123')
        expect(result.user.email).toBe('admin@example.com')
        expect(result.token).toBeDefined()
    })

    it('should fail login with wrong password', async () => {
        await authService.register({
            email: 'admin@example.com',
            password: 'password123'
        })
        await expect(authService.login('admin@example.com', 'wrongpassword')).rejects.toThrow('Invalid credentials')
    })
})
