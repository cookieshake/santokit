import { SQL, isSQLWrapper } from 'drizzle-orm';
import { format } from 'sql-formatter';

export function previewSql(query: SQL): string {
    const chunks = query.getSQL().queryChunks;
    const rawSql = processChunks(chunks);
    try {
        return format(rawSql, { language: 'postgresql' });
    } catch (e) {
        return rawSql;
    }
}

function processChunks(chunks: any[]): string {
    let sql = '';

    for (const chunk of chunks) {
        if (typeof chunk === 'string') {
            sql += `'${chunk.replace(/'/g, "''")}'`;
        } else if (typeof chunk === 'number') {
            sql += String(chunk);
        } else if (typeof chunk === 'boolean') {
            sql += chunk ? 'TRUE' : 'FALSE';
        } else if (chunk === null) {
            sql += 'NULL';
        } else if (typeof chunk === 'object') {
            if (Array.isArray(chunk.value)) {
                // Static string parts
                sql += chunk.value.join('');
            } else if (typeof chunk.value === 'string') {
                // Identifier
                sql += `"${chunk.value}"`;
            } else if (chunk.queryChunks) {
                // Nested SQL - Check this BEFORE isSQLWrapper
                sql += processChunks(chunk.queryChunks);
            } else if (isSQLWrapper(chunk)) {
                sql += previewSql(chunk as SQL);
            }
        }
    }
    return sql;
}
