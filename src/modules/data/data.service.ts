import { collectionService } from '@/modules/collection/collection.service.js'
import { projectRepository } from '@/modules/project/project.repository.js'
import { connectionManager } from '@/db/connection-manager.js'
import { sql, eq } from 'drizzle-orm'
import { CONSTANTS } from '@/constants.js'

export const dataService = {
    // Insert Data
    create: async (projectId: string | number, collectionName: string, data: Record<string, any>) => {
        // --- 1. SYSTEM PROJECT HANDLING ---
        if (projectId === CONSTANTS.PROJECTS.SYSTEM_ID) {
            return await handleSystemCreate(collectionName, data)
        }

        const pid = Number(projectId)

        // 2. Resolve Meta
        // Use service to get detail (which resolves physical name via introspection)
        const detail = await collectionService.getDetail(pid, collectionName)
        const physicalName = detail.meta.physicalName

        const project = await projectRepository.findById(pid)
        if (!project) throw new Error('Project not found')

        const targetDb = await connectionManager.getConnection(project.name)
        if (!targetDb) throw new Error('Could not connect')

        // 3. Dynamic Insert
        const keys = Object.keys(data)
        const values = Object.values(data)

        const cols = keys.map(k => `"${k}"`).join(', ')

        const valueString = values.map(v => {
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
            if (v === null || v === undefined) return 'NULL'
            return v
        }).join(', ')

        const query = `INSERT INTO "${physicalName}" (${cols}) VALUES (${valueString}) RETURNING id`
        const result = await targetDb.execute(sql.raw(query))
        return result.rows[0]
    },

    // Query Data
    findAll: async (projectId: string | number, collectionName: string) => {
        // --- SYSTEM PROJECT HANDLING ---
        if (projectId === CONSTANTS.PROJECTS.SYSTEM_ID) {
            return await handleSystemFindAll(collectionName)
        }

        const pid = Number(projectId)

        const detail = await collectionService.getDetail(pid, collectionName)
        const physicalName = detail.meta.physicalName

        const project = await projectRepository.findById(pid)
        if (!project) throw new Error('Project not found')

        const targetDb = await connectionManager.getConnection(project.name)
        if (!targetDb) throw new Error('Could not connect')

        const result = await targetDb.execute(sql.raw(`SELECT * FROM "${physicalName}"`))
        return result.rows
    },

    // Update Data
    update: async (projectId: string | number, collectionName: string, id: string | number, data: Record<string, any>) => {
        if (projectId === CONSTANTS.PROJECTS.SYSTEM_ID) {
            return await handleSystemUpdate(collectionName, id, data)
        }
        // TODO: Implement generic update for user projects
        throw new Error("Update not yet implemented for user collections")
    },

    // Delete Data
    delete: async (projectId: string | number, collectionName: string, id: string | number) => {
        if (projectId === CONSTANTS.PROJECTS.SYSTEM_ID) {
            return await handleSystemDelete(collectionName, id)
        }
        // TODO: Implement generic delete for user projects
        throw new Error("Delete not yet implemented for user collections")
    }
}

// --- Internal Helpers for System Project ---
import { db } from '@/db/index.js'
import { projects } from '@/db/schema.js'
import { projectService } from '@/modules/project/project.service.js'
import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

// Define accounts table locally since it was removed from global schema
const accounts = pgTable("accounts", {
    id: text("id").primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    password: text('password').notNull(),
    roles: text('roles').array().notNull().default(['user']),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

const SYSTEM_COLLECTIONS: Record<string, any> = {
    'projects': projects,
    'accounts': accounts
}

async function handleSystemCreate(collectionName: string, data: Record<string, any>) {
    const table = SYSTEM_COLLECTIONS[collectionName.toLowerCase()]
    if (!table) throw new Error(`System collection '${collectionName}' not found`)

    // Insert into internal DB
    // @ts-ignore
    const result = await db.insert(table).values(data).returning() as any[];
    const inserted = result[0];

    // --- HOOKS: Side Effects ---
    if (collectionName.toLowerCase() === 'projects') {
        const newProject = inserted as typeof projects.$inferSelect
        // Provisioning: Create DB/Schema on the data source
        await projectService.initializeDataSource(newProject.name)
    }

    return inserted
}

async function handleSystemFindAll(collectionName: string) {
    const table = SYSTEM_COLLECTIONS[collectionName.toLowerCase()]
    if (!table) throw new Error(`System collection '${collectionName}' not found`)

    return await db.select().from(table)
}

async function handleSystemUpdate(collectionName: string, id: string | number, data: Record<string, any>) {
    const table = SYSTEM_COLLECTIONS[collectionName.toLowerCase()]
    if (!table) throw new Error(`System collection '${collectionName}' not found`)

    // @ts-ignore
    const result = await db.update(table).set(data).where(eq(table.id, id)).returning() as any[];
    const updated = result[0]

    // --- HOOKS ---
    if (collectionName.toLowerCase() === 'projects') {
        const project = updated as typeof projects.$inferSelect
        // If connectionString changed, re-init?
        await projectService.initializeDataSource(project.name)
    }
    return updated
}

async function handleSystemDelete(collectionName: string, id: string | number) {
    const table = SYSTEM_COLLECTIONS[collectionName.toLowerCase()]
    if (!table) throw new Error(`System collection '${collectionName}' not found`)

    // @ts-ignore
    const result = await db.delete(table).where(eq(table.id, id)).returning() as any[];
    return result[0]
}
