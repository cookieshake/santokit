import type { DbAdapter, IdType } from './db-adapter.js'

export class SqliteAdapter implements DbAdapter {
    readonly dialect = 'sqlite' as const

    tableExistsQuery(tableName: string): { sql: string; params: any[] } {
        return {
            sql: `SELECT COUNT(*) as count FROM sqlite_master WHERE type='table' AND name=?`,
            params: [tableName]
        }
    }

    createTableSql(tableName: string, idType: IdType): string {
        const idCol = this.mapIdColumn(idType)
        return `CREATE TABLE "${tableName}" (${idCol}, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`
    }

    dropTableSql(tableName: string): string {
        return `DROP TABLE IF EXISTS "${tableName}"`
    }

    addColumnSql(table: string, column: string, type: string, nullable: boolean): string {
        const sqlType = this.mapType(type)
        // SQLite doesn't enforce NOT NULL in ALTER TABLE ADD COLUMN for existing rows
        const nullableStr = nullable ? '' : 'NOT NULL'
        return `ALTER TABLE "${table}" ADD COLUMN "${column}" ${sqlType} ${nullableStr}`.trim()
    }

    addArrayColumnSql(table: string, column: string, _elementType: string, defaultValue?: string): string {
        // SQLite doesn't support array types - use JSON text instead
        const defaultClause = defaultValue ? ` DEFAULT '${JSON.stringify(defaultValue.replace(/[{}]/g, '').split(','))}'` : ''
        return `ALTER TABLE "${table}" ADD COLUMN "${column}" TEXT${defaultClause}`
    }

    dropColumnSql(table: string, column: string): string {
        return `ALTER TABLE "${table}" DROP COLUMN "${column}"`
    }

    renameColumnSql(table: string, oldName: string, newName: string): string {
        return `ALTER TABLE "${table}" RENAME COLUMN "${oldName}" TO "${newName}"`
    }

    getColumnsQuery(tableName: string): { sql: string; params: any[] } {
        return {
            sql: `PRAGMA table_info("${tableName}")`,
            params: []
        }
    }

    getIndexesQuery(tableName: string): { sql: string; params: any[] } {
        return {
            sql: `SELECT name as indexname, sql as indexdef FROM sqlite_master WHERE type='index' AND tbl_name=?`,
            params: [tableName]
        }
    }

    createIndexSql(table: string, indexName: string, columns: string[], unique: boolean): string {
        const uniqueStr = unique ? 'UNIQUE ' : ''
        const colsStr = columns.map(c => `"${c}"`).join(', ')
        return `CREATE ${uniqueStr}INDEX "${indexName}" ON "${table}" (${colsStr})`
    }

    dropIndexSql(indexName: string): string {
        return `DROP INDEX IF EXISTS "${indexName}"`
    }

    mapType(type: string): string {
        switch (type.toLowerCase()) {
            case 'integer':
            case 'int':
            case 'serial':
                return 'INTEGER'
            case 'boolean':
            case 'bool':
                return 'INTEGER' // SQLite uses 0/1 for boolean
            case 'timestamp':
                return 'TEXT' // SQLite stores dates as TEXT
            case 'uuid':
                return 'TEXT'
            default:
                return 'TEXT'
        }
    }

    mapIdColumn(idType: IdType): string {
        switch (idType) {
            case 'serial':
                return 'id INTEGER PRIMARY KEY AUTOINCREMENT'
            case 'uuid':
            case 'text':
            case 'typeid':
                return 'id TEXT PRIMARY KEY'
        }
    }

    nowExpression(): string {
        return "datetime('now')"
    }
}
