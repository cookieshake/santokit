import type { DatabasePool } from './server.js';
import type { PermissionsConfig, UserInfo, CRUDOperation } from './types.js';
import { checkCRUDPermission, filterColumns, applyRLSFilter } from './permission-checker.js';
import { shouldExcludeFromSelectAll } from './permissions.js';

/**
 * CRUD parameters for select operation
 */
interface SelectParams {
    where?: Record<string, unknown>;
    select?: string[];
    orderBy?: Record<string, 'asc' | 'desc'>;
    limit?: number;
    offset?: number;
}

/**
 * CRUD parameters for insert operation
 */
interface InsertParams {
    data: Record<string, unknown>;
}

/**
 * CRUD parameters for update operation
 */
interface UpdateParams {
    where: Record<string, unknown>;
    data: Record<string, unknown>;
}

/**
 * CRUD parameters for delete operation
 */
interface DeleteParams {
    where: Record<string, unknown>;
}

/**
 * Get all columns for a table from database schema
 */
async function getTableColumns(
    db: DatabasePool,
    tableName: string
): Promise<string[]> {
    // Query information_schema to get column names
    const result = await db.query(
        `SELECT column_name 
     FROM information_schema.columns 
     WHERE table_name = $1 
     ORDER BY ordinal_position`,
        [tableName]
    ) as Array<{ column_name: string }>;

    return result.map(row => row.column_name);
}

/**
 * Build WHERE clause SQL
 */
function buildWhereClause(
    where: Record<string, unknown>,
    startIndex: number = 1
): { sql: string; values: unknown[] } {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIndex = startIndex;

    for (const [key, value] of Object.entries(where)) {
        conditions.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
    }

    const sql = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { sql, values };
}

/**
 * Build ORDER BY clause SQL
 */
function buildOrderByClause(orderBy?: Record<string, 'asc' | 'desc'>): string {
    if (!orderBy || Object.keys(orderBy).length === 0) {
        return '';
    }

    const orders = Object.entries(orderBy).map(
        ([col, dir]) => `${col} ${dir.toUpperCase()}`
    );

    return `ORDER BY ${orders.join(', ')}`;
}

/**
 * Handle SELECT operation
 */
export async function handleCRUDSelect(
    db: DatabasePool,
    tableName: string,
    params: SelectParams,
    config: PermissionsConfig,
    user: UserInfo | undefined
): Promise<unknown> {
    // Get all columns from schema
    const allColumns = await getTableColumns(db, tableName);

    // Filter columns based on permissions
    const { allowed: allowedColumns, denied } = filterColumns(
        config,
        tableName,
        allColumns,
        user,
        params.select
    );

    // If specific columns were requested but denied, throw error
    if (params.select && denied.length > 0) {
        throw new Error(`Permission denied for columns: ${denied.join(', ')}`);
    }

    // Check table-level permission
    const permCheck = checkCRUDPermission(config, tableName, 'select', user, allowedColumns);
    if (!permCheck.allowed) {
        throw new Error(permCheck.reason ?? 'Permission denied');
    }

    // Apply RLS filter to WHERE clause
    const finalWhere = applyRLSFilter(params.where, permCheck.rlsFilter);

    // Build SELECT query
    const columnList = allowedColumns.join(', ');
    const { sql: whereSQL, values } = buildWhereClause(finalWhere);
    const orderBySQL = buildOrderByClause(params.orderBy);
    const limitSQL = params.limit ? `LIMIT ${params.limit}` : '';
    const offsetSQL = params.offset ? `OFFSET ${params.offset}` : '';

    const query = `
    SELECT ${columnList}
    FROM ${tableName}
    ${whereSQL}
    ${orderBySQL}
    ${limitSQL}
    ${offsetSQL}
  `.trim();

    return await db.query(query, values);
}

/**
 * Handle INSERT operation
 */
export async function handleCRUDInsert(
    db: DatabasePool,
    tableName: string,
    params: InsertParams,
    config: PermissionsConfig,
    user: UserInfo | undefined
): Promise<unknown> {
    // Check table-level permission
    const permCheck = checkCRUDPermission(config, tableName, 'insert', user);
    if (!permCheck.allowed) {
        throw new Error(permCheck.reason ?? 'Permission denied');
    }

    // Check column-level permissions for each field
    const columns = Object.keys(params.data);
    const insertCheck = checkCRUDPermission(config, tableName, 'insert', user, columns);
    if (!insertCheck.allowed) {
        throw new Error(insertCheck.reason ?? 'Permission denied');
    }

    // Build INSERT query
    const columnList = columns.join(', ');
    const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
    const values = columns.map(col => params.data[col]);

    const query = `
    INSERT INTO ${tableName} (${columnList})
    VALUES (${placeholders})
    RETURNING *
  `.trim();

    return await db.query(query, values);
}

/**
 * Handle UPDATE operation
 */
export async function handleCRUDUpdate(
    db: DatabasePool,
    tableName: string,
    params: UpdateParams,
    config: PermissionsConfig,
    user: UserInfo | undefined
): Promise<unknown> {
    // Check table-level permission
    const permCheck = checkCRUDPermission(config, tableName, 'update', user);
    if (!permCheck.allowed) {
        throw new Error(permCheck.reason ?? 'Permission denied');
    }

    // Check column-level permissions for fields being updated
    const columns = Object.keys(params.data);
    const updateCheck = checkCRUDPermission(config, tableName, 'update', user, columns);
    if (!updateCheck.allowed) {
        throw new Error(updateCheck.reason ?? 'Permission denied');
    }

    // Apply RLS filter to WHERE clause
    const finalWhere = applyRLSFilter(params.where, permCheck.rlsFilter);

    // Build UPDATE query
    const setClause = columns.map((col, i) => `${col} = $${i + 1}`).join(', ');
    const setValues = columns.map(col => params.data[col]);

    const { sql: whereSQL, values: whereValues } = buildWhereClause(
        finalWhere,
        columns.length + 1
    );

    const query = `
    UPDATE ${tableName}
    SET ${setClause}
    ${whereSQL}
    RETURNING *
  `.trim();

    return await db.query(query, [...setValues, ...whereValues]);
}

/**
 * Handle DELETE operation
 */
export async function handleCRUDDelete(
    db: DatabasePool,
    tableName: string,
    params: DeleteParams,
    config: PermissionsConfig,
    user: UserInfo | undefined
): Promise<unknown> {
    // Check table-level permission
    const permCheck = checkCRUDPermission(config, tableName, 'delete', user);
    if (!permCheck.allowed) {
        throw new Error(permCheck.reason ?? 'Permission denied');
    }

    // Apply RLS filter to WHERE clause
    const finalWhere = applyRLSFilter(params.where, permCheck.rlsFilter);

    // Build DELETE query
    const { sql: whereSQL, values } = buildWhereClause(finalWhere);

    const query = `
    DELETE FROM ${tableName}
    ${whereSQL}
    RETURNING *
  `.trim();

    return await db.query(query, values);
}

/**
 * Main CRUD handler dispatcher
 */
export async function handleCRUD(
    db: DatabasePool,
    tableName: string,
    operation: CRUDOperation,
    params: unknown,
    config: PermissionsConfig,
    user: UserInfo | undefined
): Promise<unknown> {
    switch (operation) {
        case 'select':
            return handleCRUDSelect(db, tableName, params as SelectParams, config, user);
        case 'insert':
            return handleCRUDInsert(db, tableName, params as InsertParams, config, user);
        case 'update':
            return handleCRUDUpdate(db, tableName, params as UpdateParams, config, user);
        case 'delete':
            return handleCRUDDelete(db, tableName, params as DeleteParams, config, user);
        default:
            throw new Error(`Unknown CRUD operation: ${operation}`);
    }
}
