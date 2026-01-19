import { sql, type RawBuilder } from 'kysely'
import type { DbAdapter, IdType } from './db-adapter.js'

export class PostgresAdapter implements DbAdapter {
    readonly dialect = 'postgres' as const

    tableExistsQuery(tableName: string): RawBuilder<any> {
        return sql`SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${tableName})`
    }

    createTableSql(tableName: string, idType: IdType): RawBuilder<any> {
        const idCol = this.mapIdColumn(idType)
        return sql`CREATE TABLE ${sql.table(tableName)} (${sql.raw(idCol)}, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`
    }

    dropTableSql(tableName: string): RawBuilder<any> {
        return sql`DROP TABLE IF EXISTS ${sql.table(tableName)}`
    }

    addColumnSql(table: string, column: string, type: string, nullable: boolean): RawBuilder<any> {
        const sqlType = this.mapType(type)
        const nullableStr = nullable ? 'NULL' : 'NOT NULL'
        return sql`ALTER TABLE ${sql.table(table)} ADD COLUMN ${sql.id(column)} ${sql.raw(sqlType)} ${sql.raw(nullableStr)}`
    }

    addArrayColumnSql(table: string, column: string, elementType: string, defaultValue?: string): RawBuilder<any> {
        const sqlType = `${elementType.toUpperCase()}[]`
        const defaultClause = defaultValue ? ` DEFAULT '${defaultValue}'` : ''
        return sql`ALTER TABLE ${sql.table(table)} ADD COLUMN ${sql.id(column)} ${sql.raw(sqlType)}${sql.raw(defaultClause)}`
    }

    dropColumnSql(table: string, column: string): RawBuilder<any> {
        return sql`ALTER TABLE ${sql.table(table)} DROP COLUMN ${sql.id(column)}`
    }

    renameColumnSql(table: string, oldName: string, newName: string): RawBuilder<any> {
        return sql`ALTER TABLE ${sql.table(table)} RENAME COLUMN ${sql.id(oldName)} TO ${sql.id(newName)}`
    }

    getColumnsQuery(tableName: string): RawBuilder<any> {
        return sql`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = ${tableName}`
    }

    getIndexesQuery(tableName: string): RawBuilder<any> {
        return sql`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = ${tableName}`
    }

    createIndexSql(table: string, indexName: string, columns: string[], unique: boolean): RawBuilder<any> {
        const uniqueStr = unique ? 'UNIQUE ' : ''
        const colsStr = columns.map(c => `"${c}"`).join(', ')
        return sql`CREATE ${sql.raw(uniqueStr)}INDEX ${sql.id(indexName)} ON ${sql.table(table)} (${sql.raw(colsStr)})`
    }

    dropIndexSql(indexName: string): RawBuilder<any> {
        return sql`DROP INDEX ${sql.id(indexName)}`
    }

    mapType(type: string): string {
        switch (type.toLowerCase()) {
            case 'integer':
            case 'int':
                return 'INTEGER'
            case 'boolean':
            case 'bool':
                return 'BOOLEAN'
            case 'timestamp':
                return 'TIMESTAMP'
            case 'uuid':
                return 'UUID'
            default:
                return 'TEXT'
        }
    }

    mapIdColumn(idType: IdType): string {
        switch (idType) {
            case 'serial':
                return 'id SERIAL PRIMARY KEY'
            case 'uuid':
                return 'id UUID PRIMARY KEY DEFAULT gen_random_uuid()'
            case 'text':
            case 'typeid':
                return 'id TEXT PRIMARY KEY'
        }
    }

    nowExpression(): string {
        return 'NOW()'
    }
}
