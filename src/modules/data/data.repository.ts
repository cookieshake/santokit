import type { Kysely } from 'kysely'

export const dataRepository = {
    create: async (db: Kysely<any>, tableName: string, data: Record<string, any>) => {
        const result = await db
            .insertInto(tableName as any)
            .values(data)
            .returning('id' as any)
            .executeTakeFirst()
        return result
    },

    findAll: async (db: Kysely<any>, tableName: string, whereClause?: string | null) => {
        let query = db.selectFrom(tableName as any).selectAll()

        // Note: whereClause is raw SQL for backward compatibility
        // TODO: Consider refactoring callers to use structured where conditions
        if (whereClause) {
            const { sql } = await import('kysely')
            query = query.where(sql.raw(whereClause) as any)
        }

        return await query.execute()
    },

    update: async (db: Kysely<any>, tableName: string, id: string, data: Record<string, any>, whereClause?: string | null) => {
        if (Object.keys(data).length === 0) return null

        let query = db
            .updateTable(tableName as any)
            .set(data)
            .where('id' as any, '=', id)

        if (whereClause) {
            const { sql } = await import('kysely')
            query = query.where(sql.raw(whereClause) as any)
        }

        const result = await query.returningAll().executeTakeFirst()
        return result
    },

    delete: async (db: Kysely<any>, tableName: string, id: string, whereClause?: string | null) => {
        let query = db
            .deleteFrom(tableName as any)
            .where('id' as any, '=', id)

        if (whereClause) {
            const { sql } = await import('kysely')
            query = query.where(sql.raw(whereClause) as any)
        }

        const result = await query.returning('id' as any).executeTakeFirst()
        return result
    }
}

