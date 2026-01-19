import { collectionService } from '@/modules/collection/collection.service.js'
import { connectionManager } from '@/db/connection-manager.js'
import { sql } from 'kysely'

export const dataService = {
    // User Data Operations
    create: async (databaseId: string, collectionName: string, data: Record<string, any>) => {
        // 1. Resolve Meta
        const detail = await collectionService.getDetail(databaseId, collectionName)
        const physicalName = detail.meta.physical_name

        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        // 2. Dynamic Insert
        const keys = Object.keys(data)
        const values = Object.values(data)
        const cols = keys.map(k => `"${k}"`).join(', ')
        const valueString = values.map(v => {
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
            if (v === null || v === undefined) return 'NULL'
            return v
        }).join(', ')

        const query = `INSERT INTO "${physicalName}" (${cols}) VALUES (${valueString}) RETURNING id`
        const result = await sql.raw(query).execute(targetDb)
        return result.rows[0]
    },

    findAll: async (databaseId: string, collectionName: string, whereClause?: string | null) => {
        const detail = await collectionService.getDetail(databaseId, collectionName)
        const physicalName = detail.meta.physical_name

        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        const sqlQuery = `SELECT * FROM "${physicalName}"${whereClause ? ` WHERE ${whereClause}` : ''}`
        const result = await sql.raw(sqlQuery).execute(targetDb)
        return result.rows
    },

    update: async (databaseId: string, collectionName: string, id: string, data: Record<string, any>, whereClause?: string | null) => {
        const detail = await collectionService.getDetail(databaseId, collectionName)
        const physicalName = detail.meta.physical_name

        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        const keys = Object.keys(data)
        if (keys.length === 0) return null

        const sets = keys.map(k => {
            const val = data[k]
            const valStr = (typeof val === 'string') ? `'${val.replace(/'/g, "''")}'` : (val === null ? 'NULL' : val)
            return `"${k}" = ${valStr}`
        }).join(', ')

        const baseWhere = `id = '${id}'` // Always string now? Or TypeID/UUID string.
        const finalWhere = whereClause ? `(${baseWhere}) AND (${whereClause})` : baseWhere

        const query = `UPDATE "${physicalName}" SET ${sets} WHERE ${finalWhere} RETURNING *`
        const result = await sql.raw(query).execute(targetDb)
        return result.rows[0]
    },

    delete: async (databaseId: string, collectionName: string, id: string, whereClause?: string | null) => {
        const detail = await collectionService.getDetail(databaseId, collectionName)
        const physicalName = detail.meta.physical_name

        const targetDb = await connectionManager.getConnection(databaseId)
        if (!targetDb) throw new Error('Could not connect')

        const baseWhere = `id = ${typeof id === 'string' ? `'${id}'` : id}`
        const finalWhere = whereClause ? `(${baseWhere}) AND (${whereClause})` : baseWhere

        const query = `DELETE FROM "${physicalName}" WHERE ${finalWhere} RETURNING id`
        const result = await sql.raw(query).execute(targetDb)
        return result.rows[0]
    }
}
