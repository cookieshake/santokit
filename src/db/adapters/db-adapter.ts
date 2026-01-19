import type { Kysely } from 'kysely'

export type IdType = 'serial' | 'uuid' | 'text' | 'typeid'

export interface DbAdapter {
    readonly dialect: 'postgres' | 'sqlite'

    // DDL Operations
    tableExistsQuery(tableName: string): { sql: string; params: any[] }
    createTableSql(tableName: string, idType: IdType): string
    dropTableSql(tableName: string): string

    // Column Operations
    addColumnSql(table: string, column: string, type: string, nullable: boolean): string
    addArrayColumnSql(table: string, column: string, elementType: string, defaultValue?: string): string
    dropColumnSql(table: string, column: string): string
    renameColumnSql(table: string, oldName: string, newName: string): string

    // Schema Introspection
    getColumnsQuery(tableName: string): { sql: string; params: any[] }
    getIndexesQuery(tableName: string): { sql: string; params: any[] }

    // Index Operations
    createIndexSql(table: string, indexName: string, columns: string[], unique: boolean): string
    dropIndexSql(indexName: string): string

    // Type Mapping
    mapType(type: string): string
    mapIdColumn(idType: IdType): string
    nowExpression(): string
}
