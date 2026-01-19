import type { Kysely, RawBuilder } from 'kysely'

export type IdType = 'serial' | 'uuid' | 'text' | 'typeid'

export interface DbAdapter {
    readonly dialect: 'postgres'

    // DDL Operations
    tableExistsQuery(tableName: string): RawBuilder<any>
    createTableSql(tableName: string, idType: IdType): RawBuilder<any>
    dropTableSql(tableName: string): RawBuilder<any>

    // Column Operations
    addColumnSql(table: string, column: string, type: string, nullable: boolean): RawBuilder<any>
    addArrayColumnSql(table: string, column: string, elementType: string, defaultValue?: string): RawBuilder<any>
    dropColumnSql(table: string, column: string): RawBuilder<any>
    renameColumnSql(table: string, oldName: string, newName: string): RawBuilder<any>

    // Schema Introspection
    getColumnsQuery(tableName: string): RawBuilder<any>
    getIndexesQuery(tableName: string): RawBuilder<any>

    // Index Operations
    createIndexSql(table: string, indexName: string, columns: string[], unique: boolean): RawBuilder<any>
    dropIndexSql(indexName: string): RawBuilder<any>

    // Type Mapping
    mapType(type: string): string
    mapIdColumn(idType: IdType): string
    nowExpression(): string
}
