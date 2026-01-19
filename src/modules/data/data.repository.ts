import { sql } from 'kysely'
import type { Kysely } from 'kysely'

export const dataRepository = {
    create: async (db: Kysely<any>, tableName: string, data: Record<string, any>) => {
        const keys = Object.keys(data)
        const values = Object.values(data)
        const cols = keys.map(k => `"${k}"`).join(', ')
        const valueString = values.map(v => {
            if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
            if (v === null || v === undefined) return 'NULL'
            return v
        }).join(', ')

        const query = `INSERT INTO "${tableName}" (${cols}) VALUES (${valueString}) RETURNING id`
        const result = await sql.raw(query).execute(db)
        return result.rows[0]
    },

    findAll: async (db: Kysely<any>, tableName: string, whereClause?: string | null) => {
        const sqlQuery = `SELECT * FROM "${tableName}"${whereClause ? ` WHERE ${whereClause}` : ''}`
        const result = await sql.raw(sqlQuery).execute(db)
        return result.rows
    },

    update: async (db: Kysely<any>, tableName: string, id: string, data: Record<string, any>, whereClause?: string | null) => {
        const keys = Object.keys(data)
        if (keys.length === 0) return null

        const sets = keys.map(k => {
            const val = data[k]
            const valStr = (typeof val === 'string') ? `'${val.replace(/'/g, "''")}'` : (val === null ? 'NULL' : val)
            return `"${k}" = ${valStr}`
        }).join(', ')

        const baseWhere = `id = '${id}'`
        const finalWhere = whereClause ? `(${baseWhere}) AND (${whereClause})` : baseWhere

        const query = `UPDATE "${tableName}" SET ${sets} WHERE ${finalWhere} RETURNING *`
        const result = await sql.raw(query).execute(db)
        return result.rows[0]
    },

    delete: async (db: Kysely<any>, tableName: string, id: string, whereClause?: string | null) => {
        const baseWhere = `id = ${typeof id === 'string' ? `'${id}'` : id}`
        const finalWhere = whereClause ? `(${baseWhere}) AND (${whereClause})` : baseWhere

        const query = `DELETE FROM "${tableName}" WHERE ${finalWhere} RETURNING id`
        const result = await sql.raw(query).execute(db)
        return result.rows[0]
    }
}
