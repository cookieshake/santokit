import type { DbAdapter, IdType } from './db-adapter.js'

export class PostgresAdapter implements DbAdapter {
    readonly dialect = 'postgres' as const

    tableExistsQuery(tableName: string): { sql: string; params: any[] } {
        return {
            sql: `SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1)`,
            params: [tableName]
        }
    }

    createTableSql(tableName: string, idType: IdType): string {
        const idCol = this.mapIdColumn(idType)
        return `CREATE TABLE "${tableName}" (${idCol}, created_at TIMESTAMP DEFAULT NOW(), updated_at TIMESTAMP DEFAULT NOW())`
    }

    dropTableSql(tableName: string): string {
        return `DROP TABLE IF EXISTS "${tableName}"`
    }

    addColumnSql(table: string, column: string, type: string, nullable: boolean): string {
        const sqlType = this.mapType(type)
        const nullableStr = nullable ? 'NULL' : 'NOT NULL'
        return `ALTER TABLE "${table}" ADD COLUMN "${column}" ${sqlType} ${nullableStr}`
    }

    addArrayColumnSql(table: string, column: string, elementType: string, defaultValue?: string): string {
        const sqlType = `${elementType.toUpperCase()}[]`
        const defaultClause = defaultValue ? ` DEFAULT '${defaultValue}'` : ''
        return `ALTER TABLE "${table}" ADD COLUMN "${column}" ${sqlType}${defaultClause}`
    }

    dropColumnSql(table: string, column: string): string {
        return `ALTER TABLE "${table}" DROP COLUMN "${column}"`
    }

    renameColumnSql(table: string, oldName: string, newName: string): string {
        return `ALTER TABLE "${table}" RENAME COLUMN "${oldName}" TO "${newName}"`
    }

    getColumnsQuery(tableName: string): { sql: string; params: any[] } {
        return {
            sql: `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = $1`,
            params: [tableName]
        }
    }

    getIndexesQuery(tableName: string): { sql: string; params: any[] } {
        return {
            sql: `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1`,
            params: [tableName]
        }
    }

    createIndexSql(table: string, indexName: string, columns: string[], unique: boolean): string {
        const uniqueStr = unique ? 'UNIQUE ' : ''
        const colsStr = columns.map(c => `"${c}"`).join(', ')
        return `CREATE ${uniqueStr}INDEX "${indexName}" ON "${table}" (${colsStr})`
    }

    dropIndexSql(indexName: string): string {
        return `DROP INDEX "${indexName}"`
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
