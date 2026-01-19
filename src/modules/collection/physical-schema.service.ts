import { connectionManager } from '@/db/connection-manager.js'
import { getDbConnection } from '@/lib/db-helpers.js'

import { previewRawSql } from './sql-preview.js'

export const physicalSchemaService = {
  checkTableExists: async (databaseId: string, physicalName: string) => {
    const targetDb = await connectionManager.getConnection(databaseId)
    if (!targetDb) return false

    const { adapter } = await getDbConnection(databaseId)

    const query = adapter.tableExistsQuery(physicalName)
    const result = await query.execute(targetDb)
    return (result.rows[0] as { exists: boolean }).exists === true
  },

  /**
   * Creates the physical table and returns executed SQL or generated SQL (if dryRun)
   */
  createTable: async (
    databaseId: string,
    physicalName: string,
    idType: 'serial' | 'uuid' | 'text' | 'typeid',
    dryRun: boolean,
  ): Promise<string | void> => {
    const { db: targetDb, adapter } = await getDbConnection(databaseId)
    const rawSql = adapter.createTableSql(physicalName, idType)

    if (dryRun) {
      return previewRawSql(rawSql.compile(targetDb).sql)
    }

    await rawSql.execute(targetDb)
  },

  dropTable: async (
    databaseId: string,
    physicalName: string,
    dryRun: boolean = false,
  ): Promise<string | void> => {
    const { db: targetDb, adapter } = await getDbConnection(databaseId)
    const rawSql = adapter.dropTableSql(physicalName)

    if (dryRun) {
      return previewRawSql(rawSql.compile(targetDb).sql)
    }

    await rawSql.execute(targetDb)
  },

  /**
   * Adds default authentication fields to the physical table
   */
  addAuthFields: async (
    databaseId: string,
    physicalName: string,
    dryRun: boolean,
  ): Promise<string[]> => {
    const sqls: string[] = []

    if (dryRun) {
      sqls.push(previewRawSql(`ALTER TABLE "${physicalName}" ADD COLUMN "email" TEXT NOT NULL`))
      sqls.push(previewRawSql(`ALTER TABLE "${physicalName}" ADD COLUMN "password" TEXT NOT NULL`))
      sqls.push(previewRawSql(`ALTER TABLE "${physicalName}" ADD COLUMN "name" TEXT NOT NULL`))
      sqls.push(`ALTER TABLE "${physicalName}" ADD COLUMN "roles" TEXT[] DEFAULT '{"user"}'`)
      sqls.push(
        previewRawSql(
          `CREATE UNIQUE INDEX "${physicalName}_email_idx" ON "${physicalName}" ("email")`,
        ),
      )
      return sqls
    }

    await physicalSchemaService.addField(databaseId, physicalName, 'email', 'text', false, false)
    await physicalSchemaService.addField(databaseId, physicalName, 'password', 'text', false, false)
    await physicalSchemaService.addField(databaseId, physicalName, 'name', 'text', false, false)
    await physicalSchemaService.addArrayField(
      databaseId,
      physicalName,
      'roles',
      'TEXT',
      '{"user"}',
      false,
    )
    await physicalSchemaService.createIndex(
      databaseId,
      physicalName,
      `${physicalName}_email_idx`,
      ['email'],
      true,
      false,
    )

    return []
  },

  getFields: async (databaseId: string, physicalName: string) => {
    const { db: targetDb, adapter } = await getDbConnection(databaseId)
    const query = adapter.getColumnsQuery(physicalName)
    const result = await query.execute(targetDb)
    return result.rows
  },

  addField: async (
    databaseId: string,
    physicalName: string,
    fieldName: string,
    type: string,
    isNullable: boolean,
    dryRun: boolean,
  ): Promise<string | void> => {
    const { db: targetDb, adapter } = await getDbConnection(databaseId)
    const rawSql = adapter.addColumnSql(physicalName, fieldName, type, isNullable)

    if (dryRun) return previewRawSql(rawSql.compile(targetDb).sql)

    await rawSql.execute(targetDb)
  },

  addArrayField: async (
    databaseId: string,
    physicalName: string,
    fieldName: string,
    elementType: string,
    defaultValue?: string,
    dryRun: boolean = false,
  ): Promise<string | void> => {
    const { db: targetDb, adapter } = await getDbConnection(databaseId)
    const rawSql = adapter.addArrayColumnSql(physicalName, fieldName, elementType, defaultValue)

    if (dryRun) return previewRawSql(rawSql.compile(targetDb).sql)

    await rawSql.execute(targetDb)
  },

  removeField: async (
    databaseId: string,
    physicalName: string,
    fieldName: string,
    dryRun: boolean,
  ): Promise<string | void> => {
    const { db: targetDb, adapter } = await getDbConnection(databaseId)
    const rawSql = adapter.dropColumnSql(physicalName, fieldName)
    if (dryRun) return previewRawSql(rawSql.compile(targetDb).sql)

    await rawSql.execute(targetDb)
  },

  renameField: async (
    databaseId: string,
    physicalName: string,
    oldName: string,
    newName: string,
    dryRun: boolean,
  ): Promise<string | void> => {
    const { db: targetDb, adapter } = await getDbConnection(databaseId)
    const rawSql = adapter.renameColumnSql(physicalName, oldName, newName)
    if (dryRun) return previewRawSql(rawSql.compile(targetDb).sql)

    await rawSql.execute(targetDb)
  },

  getIndexes: async (databaseId: string, physicalName: string) => {
    const { db: targetDb, adapter } = await getDbConnection(databaseId)
    const query = adapter.getIndexesQuery(physicalName)
    const result = await query.execute(targetDb)
    return result.rows
  },

  createIndex: async (
    databaseId: string,
    physicalName: string,
    indexName: string,
    fields: string[],
    unique: boolean,
    dryRun: boolean,
  ): Promise<string | void> => {
    const { db: targetDb, adapter } = await getDbConnection(databaseId)
    const rawSql = adapter.createIndexSql(physicalName, indexName, fields, unique)

    if (dryRun) return previewRawSql(rawSql.compile(targetDb).sql)

    await rawSql.execute(targetDb)
  },

  removeIndex: async (
    databaseId: string,
    physicalName: string,
    indexName: string,
    dryRun: boolean,
  ): Promise<string | void> => {
    const { db: targetDb, adapter } = await getDbConnection(databaseId)
    const rawSql = adapter.dropIndexSql(indexName)
    if (dryRun) return previewRawSql(rawSql.compile(targetDb).sql)

    await rawSql.execute(targetDb)
  },
}
