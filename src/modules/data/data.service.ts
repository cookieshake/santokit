import { collectionRepository } from '@/modules/collection/collection.repository.js'
import { dataSourceRepository } from '@/modules/datasource/datasource.repository.js'
import { projectRepository } from '@/modules/project/project.repository.js'
import { connectionManager } from '@/db/connection-manager.js'
import { sql, eq } from 'drizzle-orm'

export const dataService = {
    // Insert Data
    create: async (projectId: string | number, collectionName: string, data: Record<string, any>) => {
        // --- 1. SYSTEM PROJECT HANDLING ---
        if (projectId === 'system') {
            return await handleSystemCreate(collectionName, data)
        }

        const pid = Number(projectId)

        // 2. Resolve Meta
        const col = await collectionRepository.findByProjectAndName(pid, collectionName)
        if (!col) throw new Error('Collection not found')

        const project = await projectRepository.findById(pid)
        if (!project || !project.dataSourceId) throw new Error('Project or Data Source not found')

        const source = await dataSourceRepository.findById(project.dataSourceId)
        if (!source) throw new Error('Data Source not found')

        const targetDb = await connectionManager.getConnection(source.name)
        if (!targetDb) throw new Error('Could not connect')

        // 3. Dynamic Insert
        const keys = Object.keys(data)
        const values = Object.values(data)

        const cols = keys.map(k => `"${k}"`).join(', ')
        // Drizzle PGLite driver parameterization is tricky with raw SQL, usually requires $1, $2 etc or ? depending on driver
        // For simplicity and safety in this demo, strict type checking or casting should be done.
        // But for now we use safe string escaping for values.

        const valueString = values.map(v => {
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
            if (v === null || v === undefined) return 'NULL'
            return v
        }).join(', ')

        const query = `INSERT INTO "${col.physicalName}" (${cols}) VALUES (${valueString}) RETURNING id`
        const result = await targetDb.execute(sql.raw(query))
        return result.rows[0]
    },

    // Query Data
    findAll: async (projectId: string | number, collectionName: string) => {
        // --- SYSTEM PROJECT HANDLING ---
        if (projectId === 'system') {
            return await handleSystemFindAll(collectionName)
        }

        const pid = Number(projectId)

        const col = await collectionRepository.findByProjectAndName(pid, collectionName)
        if (!col) throw new Error('Collection not found')

        const project = await projectRepository.findById(pid)
        if (!project || !project.dataSourceId) throw new Error('Project or Data Source not found')

        const source = await dataSourceRepository.findById(project.dataSourceId)
        if (!source) throw new Error('Data Source not found')

        const targetDb = await connectionManager.getConnection(source.name)
        if (!targetDb) throw new Error('Could not connect')

        const result = await targetDb.execute(sql.raw(`SELECT * FROM "${col.physicalName}"`))
        return result.rows
    },

    // Update Data
    update: async (projectId: string | number, collectionName: string, id: string | number, data: Record<string, any>) => {
        if (projectId === 'system') {
            return await handleSystemUpdate(collectionName, id, data)
        }
        // TODO: Implement generic update for user projects
        throw new Error("Update not yet implemented for user collections")
    },

    // Delete Data
    delete: async (projectId: string | number, collectionName: string, id: string | number) => {
        if (projectId === 'system') {
            return await handleSystemDelete(collectionName, id)
        }
        // TODO: Implement generic delete for user projects
        throw new Error("Delete not yet implemented for user collections")
    }
}

// --- Internal Helpers for System Project ---
import { db } from '@/db/index.js'
import { projects, dataSources, accounts, collections } from '@/db/schema.js'
import { projectService } from '@/modules/project/project.service.js'
import { dataSourceService } from '@/modules/datasource/datasource.service.js'

const SYSTEM_COLLECTIONS: Record<string, any> = {
    'projects': projects,
    'datasources': dataSources,
    'accounts': accounts, // Renamed from users
    'collections': collections
}

async function handleSystemCreate(collectionName: string, data: Record<string, any>) {
    const table = SYSTEM_COLLECTIONS[collectionName.toLowerCase()]
    if (!table) throw new Error(`System collection '${collectionName}' not found`)

    // Insert into internal DB
    // @ts-ignore - Dynamic table insertion with Drizzle is tricky for TS, suppressing for this generic handler
    const result = await db.insert(table).values(data).returning() as any[];
    const inserted = result[0];

    // --- HOOKS: Side Effects ---
    if (collectionName.toLowerCase() === 'projects') {
        const newProject = inserted as typeof projects.$inferSelect
        // Provisioning: Create DB/Schema on the data source
        if (newProject.dataSourceId) {
            await projectService.initializeDataSource(newProject.dataSourceId)
        }
    }

    // Hooks for data sources? 
    // Usually connection validation happens before insert in standard controllers, 
    // but here we might want to do it or trust the input. 
    // Ideally user 'validates' via a separate RPC call or we do it here.
    // For now, we assume simple insert.

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
        // If dataSourceId changed/set, re-init
        if (data.dataSourceId) {
            await projectService.initializeDataSource(project.dataSourceId)
        }
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
