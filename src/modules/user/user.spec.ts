import { describe, it, expect, beforeEach, vi } from 'vitest'
import { userService } from './user.service.js'
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

vi.mock('../../db/connection-manager.js', async () => {
    const { drizzle } = await import('drizzle-orm/pglite')
    const { pglite } = await import('../../db/index.js') as any
    const db = drizzle(pglite)
    return {
        connectionManager: {
            getConnection: vi.fn().mockResolvedValue(db)
        }
    }
})

// Correctly import the mocked modules
import * as dbModule from '@/db/index.js'
const { db, pglite } = dbModule as any
const pgliteInstance = pglite as any

describe('User Service (Project Level)', () => {
    let projectId1: number
    let projectId2: number

    beforeEach(async () => {
        // Basic table creation for system DB
        await pgliteInstance.exec(`
          CREATE TABLE IF NOT EXISTS admins (
            id SERIAL PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS data_sources (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            connection_string TEXT NOT NULL,
            prefix TEXT NOT NULL DEFAULT 'santoki_',
            created_at TIMESTAMP DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS projects (
            id SERIAL PRIMARY KEY,
            name TEXT NOT NULL,
            owner_id INTEGER REFERENCES admins(id),
            data_source_id INTEGER REFERENCES data_sources(id) UNIQUE,
            created_at TIMESTAMP DEFAULT NOW()
          );
          CREATE TABLE IF NOT EXISTS collections (
            id SERIAL PRIMARY KEY,
            project_id INTEGER NOT NULL REFERENCES projects(id),
            name TEXT NOT NULL,
            physical_name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
          );
        `)

        // Clear tables
        await db.execute(sql`TRUNCATE TABLE collections, projects, data_sources, admins RESTART IDENTITY CASCADE`)
        try {
            await pgliteInstance.exec(`TRUNCATE TABLE users RESTART IDENTITY CASCADE`)
        } catch (e) { }

        // Create initial setup
        await pgliteInstance.exec(`INSERT INTO admins (email, password) VALUES ('test@example.com', 'pass123')`)
        await pgliteInstance.exec(`INSERT INTO data_sources (name, connection_string) VALUES ('ds1', 'memory'), ('ds2', 'memory')`)

        const p1 = await projectService.create('Project 1', 1)
        const p2 = await projectService.create('Project 2', 1)

        await projectService.associateDataSource(p1.id, 1)
        await projectService.associateDataSource(p2.id, 2)

        projectId1 = p1.id
        projectId2 = p2.id

        // Ensure 'users' table exists in the physical DB (mocked as same pglite)
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
    })

    it('should create a user for a project (in physical DB)', async () => {
        const user = await userService.createUser(projectId1, {
            email: 'test@example.com',
            password: 'password123'
        })
        expect(user.email).toBe('test@example.com')

        // Verify it's in the DB (which is mocked as pgliteInstance)
        const res = await pgliteInstance.query(`SELECT * FROM users WHERE email = 'test@example.com'`)
        expect(res.rows.length).toBe(1)
    })

    it('should list users for a project', async () => {
        await userService.createUser(projectId1, {
            email: 'list@example.com',
            password: 'pw'
        })
        const list = await userService.listUsers(projectId1)
        expect(list.length).toBe(1)
    })

    it('should delete a user', async () => {
        const user = await userService.createUser(projectId1, {
            email: 'del@example.com',
            password: 'pw'
        })
        await userService.deleteUser(projectId1, user.id as number)
        const list = await userService.listUsers(projectId1)
        expect(list.length).toBe(0)
    })
})
