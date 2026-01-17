import { CompiledQuery } from 'kysely'
import { format } from 'sql-formatter'

export function previewSql(query: CompiledQuery): string {
    try {
        // Kysely already gives us the SQL string
        let sqlStr = query.sql

        // Replace parameter placeholders with actual values
        const params = query.parameters as any[]
        if (params && params.length > 0) {
            params.forEach((param, index) => {
                const placeholder = `$${index + 1}`
                let value: string

                if (typeof param === 'string') {
                    value = `'${param.replace(/'/g, "''")}'`
                } else if (param === null) {
                    value = 'NULL'
                } else if (typeof param === 'boolean') {
                    value = param ? 'TRUE' : 'FALSE'
                } else {
                    value = String(param)
                }

                sqlStr = sqlStr.replace(placeholder, value)
            })
        }

        return format(sqlStr, { language: 'postgresql' })
    } catch (e) {
        return query.sql
    }
}

// Helper to create a simple SQL preview from raw SQL string
export function previewRawSql(sqlStr: string): string {
    try {
        return format(sqlStr, { language: 'postgresql' })
    } catch (e) {
        return sqlStr
    }
}
