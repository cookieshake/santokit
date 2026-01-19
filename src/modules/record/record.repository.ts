import type { Expression, Kysely, SqlBool } from 'kysely'

export const recordRepository = {
  create: async (db: Kysely<any>, tableName: string, data: Record<string, unknown>) => {
    const result = await db.insertInto(tableName).values(data).returning('id').executeTakeFirst()
    return result
  },

  findAll: async (db: Kysely<any>, tableName: string, whereClause?: string | null) => {
    let query = db.selectFrom(tableName).selectAll()

    // Note: whereClause is raw SQL for backward compatibility
    // TODO: Consider refactoring callers to use structured where conditions
    if (whereClause) {
      const { sql } = await import('kysely')
      query = query.where(sql.raw(whereClause) as Expression<SqlBool>)
    }

    return await query.execute()
  },

  update: async (
    db: Kysely<any>,
    tableName: string,
    id: string,
    data: Record<string, unknown>,
    whereClause?: string | null,
  ) => {
    if (Object.keys(data).length === 0) return null

    let query = db.updateTable(tableName).set(data).where('id', '=', id)

    if (whereClause) {
      const { sql } = await import('kysely')
      query = query.where(sql.raw(whereClause) as Expression<SqlBool>)
    }

    const result = await query.returningAll().executeTakeFirst()
    return result
  },

  delete: async (db: Kysely<any>, tableName: string, id: string, whereClause?: string | null) => {
    let query = db.deleteFrom(tableName).where('id', '=', id)

    if (whereClause) {
      const { sql } = await import('kysely')
      query = query.where(sql.raw(whereClause) as Expression<SqlBool>)
    }

    const result = await query.returning('id').executeTakeFirst()
    return result
  },
}
