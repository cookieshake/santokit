import { describe, it, expect, beforeEach, vi } from 'vitest'
import { adminService } from './admin.service.js'
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

describe('Admin Module (System Level Users)', () => {
    beforeEach(async () => {
        // Table creation
        await pgliteInstance.exec(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            name TEXT,
            email TEXT NOT NULL UNIQUE,
            password TEXT,
            roles TEXT[] NOT NULL DEFAULT ARRAY['user'],
            email_verified BOOLEAN DEFAULT FALSE,
            image TEXT,
            banned BOOLEAN,
            ban_reason TEXT,
            ban_expires TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
        `)

        // Clear tables
        await mockedDb.execute(sql`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
    })

    it('should register a new admin', async () => {
        const admin = await adminService.register({
            email: 'admin@example.com',
            password: 'password123'
        })
        expect(admin.email).toBe('admin@example.com')
        expect(admin.roles).toContain('admin')
    })

    it('should NOT allow registering duplicate email', async () => {
        await adminService.register({
            email: 'admin@example.com',
            password: 'password123'
        })
        await expect(adminService.register({
            email: 'admin@example.com',
            password: 'passother'
        })).rejects.toThrow()
    })

    it('should login and return a token', async () => {
        await adminService.register({
            email: 'admin@example.com',
            password: 'password123'
        })
        const result = await adminService.login('admin@example.com', 'password123')
        expect(result.user.email).toBe('admin@example.com')
        expect(result.token).toBeDefined()
    })

    it('should fail login with wrong password', async () => {
        await adminService.register({
            email: 'admin@example.com',
            password: 'password123'
        })
        await expect(adminService.login('admin@example.com', 'wrongpassword')).rejects.toThrow('Invalid credentials')
    })
})
