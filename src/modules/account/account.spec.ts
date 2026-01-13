import { describe, it, expect, beforeEach, beforeAll, vi } from 'vitest'
import { accountService } from './account.service.js'
import { projectService } from '../project/project.service.js'
import { sql } from 'drizzle-orm'

vi.mock('../../db/index.js', async () => {
    const { PGlite } = await import('@electric-sql/pglite')
    const { drizzle } = await import('drizzle-orm/pglite')
    const schema = await import('../../db/schema.js')
    const pglite = new PGlite()
    const db = drizzle(pglite, { schema })
    return { db, pglite }
})

// Correctly import the mocked db
import * as dbModule from '@/db/index.js'
const { db, pglite } = dbModule as any
const pgliteInstance = pglite as any

describe('Account Service', () => {
    let projectId1: number
    let projectId2: number

    beforeEach(async () => {
        // Basic table creation for tests
        await pgliteInstance.exec(`
          CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS projects (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            owner_id INTEGER REFERENCES users(id),
            created_at TIMESTAMP DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS accounts (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id),
            email TEXT NOT NULL,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(project_id, email)
          );
        `)

        // Clear tables
        await db.execute(sql`TRUNCATE TABLE accounts, projects, users RESTART IDENTITY CASCADE`)

        // Create a dummy user
        await pgliteInstance.exec(`INSERT INTO users (email, password) VALUES ('test@example.com', 'pass123')`)

        // Create initial projects
        const p1 = await projectService.create('Project 1', 1)
        const p2 = await projectService.create('Project 2', 1)
        projectId1 = p1.id
        projectId2 = p2.id
    })

    it('should create an account for a project', async () => {
        const acc = await accountService.createAccount(projectId1, {
            email: 'test@example.com',
            password: 'password123'
        })
        expect(acc.projectId).toBe(projectId1)
        expect(acc.email).toBe('test@example.com')
    })

    it('should allow same email in DIFFERENT projects', async () => {
        await accountService.createAccount(projectId1, {
            email: 'test@example.com',
            password: 'password123'
        })
        const acc = await accountService.createAccount(projectId2, {
            email: 'test@example.com',
            password: 'password123'
        })
        expect(acc.projectId).toBe(projectId2)
        expect(acc.email).toBe('test@example.com')
    })

    it('should NOT allow same email in the SAME project', async () => {
        await accountService.createAccount(projectId1, {
            email: 'test@example.com',
            password: 'password123'
        })
        await expect(accountService.createAccount(projectId1, {
            email: 'test@example.com',
            password: 'password123'
        })).rejects.toThrow()
    })

    it('should list accounts for a project', async () => {
        await accountService.createAccount(projectId1, {
            email: 'test@example.com',
            password: 'password123'
        })
        const list = await accountService.listAccounts(projectId1)
        expect(list.length).toBe(1)
        expect(list[0].email).toBe('test@example.com')
    })

    it('should delete an account', async () => {
        const acc = await accountService.createAccount(projectId1, {
            email: 'delete-me@example.com',
            password: 'password123'
        })
        await accountService.deleteAccount(acc.id)
        const accountsAfter = await accountService.listAccounts(projectId1)
        expect(accountsAfter.length).toBe(0)
    })
})
