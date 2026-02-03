import type {
    PermissionsConfig,
    PermissionRole,
    CRUDOperation,
    PermissionCheckResult,
    UserInfo,
    RLSFilter
} from './types.js';
import {
    getTablePermissions,
    getColumnPermissions,
    getOwnerColumn,
    parseColumnPrefix
} from './permissions.js';

/**
 * Check if user has a specific role
 */
function hasRole(user: UserInfo | undefined, role: PermissionRole): boolean {
    if (role === 'public') {
        return true;
    }

    if (role === 'authenticated') {
        return !!user;
    }

    if (!user) {
        return false;
    }

    // Check if user has the specific role
    return user.roles.includes(role);
}

/**
 * Check table-level permission for a CRUD operation
 */
export function checkTablePermission(
    config: PermissionsConfig,
    tableName: string,
    operation: CRUDOperation,
    user: UserInfo | undefined
): PermissionCheckResult {
    const tablePerms = getTablePermissions(config, tableName);
    const allowedRoles = tablePerms[operation] ?? [];

    // Check if 'owner' is in allowed roles (special handling needed)
    const hasOwnerRole = allowedRoles.includes('owner');
    const otherRoles = allowedRoles.filter(r => r !== 'owner');

    // Check non-owner roles first
    for (const role of otherRoles) {
        if (hasRole(user, role)) {
            return { allowed: true };
        }
    }

    // If owner role is allowed, return with RLS filter
    if (hasOwnerRole && user) {
        const ownerColumn = getOwnerColumn(config, tableName);
        const rlsFilter: RLSFilter = { [ownerColumn]: user.id };
        return { allowed: true, rlsFilter };
    }

    return {
        allowed: false,
        reason: `Permission denied for ${operation} on table ${tableName}`
    };
}

/**
 * Check column-level permission
 */
export function checkColumnPermission(
    config: PermissionsConfig,
    tableName: string,
    columnName: string,
    operation: 'select' | 'update' | 'insert',
    user: UserInfo | undefined
): PermissionCheckResult {
    const columnPerms = getColumnPermissions(config, tableName, columnName);
    const allowedRoles = columnPerms[operation];

    // If no specific permissions defined, allow
    if (!allowedRoles) {
        return { allowed: true };
    }

    // Empty array means no one can access
    if (allowedRoles.length === 0) {
        return {
            allowed: false,
            reason: `Permission denied for ${operation} on column ${columnName}`
        };
    }

    // Check roles
    for (const role of allowedRoles) {
        if (hasRole(user, role)) {
            return { allowed: true };
        }
    }

    return {
        allowed: false,
        reason: `Permission denied for ${operation} on column ${columnName}`
    };
}

/**
 * Check CRUD permission (combines table and column checks)
 */
export function checkCRUDPermission(
    config: PermissionsConfig,
    tableName: string,
    operation: CRUDOperation,
    user: UserInfo | undefined,
    columns?: string[]
): PermissionCheckResult {
    // First check table-level permission
    const tableCheck = checkTablePermission(config, tableName, operation, user);
    if (!tableCheck.allowed) {
        return tableCheck;
    }

    // If columns are specified, check column-level permissions
    if (columns && (operation === 'select' || operation === 'update' || operation === 'insert')) {
        for (const column of columns) {
            const colCheck = checkColumnPermission(
                config,
                tableName,
                column,
                operation as 'select' | 'update' | 'insert',
                user
            );
            if (!colCheck.allowed) {
                return colCheck;
            }
        }
    }

    return tableCheck; // Return with potential RLS filter
}

/**
 * Filter columns based on permissions and prefixes
 */
export function filterColumns(
    config: PermissionsConfig,
    tableName: string,
    allColumns: string[],
    user: UserInfo | undefined,
    requestedColumns?: string[]
): { allowed: string[]; denied: string[] } {
    const allowed: string[] = [];
    const denied: string[] = [];

    // If specific columns requested, check those
    const columnsToCheck = requestedColumns ?? allColumns;

    for (const column of columnsToCheck) {
        // If no specific columns requested, auto-exclude c_ and p_ prefixes
        if (!requestedColumns) {
            const prefix = parseColumnPrefix(column);
            if (prefix === 'c_' || prefix === 'p_') {
                // Only include if user is admin
                if (!user || !user.roles.includes('admin')) {
                    continue;
                }
            }
        }

        // Check column permission
        const check = checkColumnPermission(config, tableName, column, 'select', user);
        if (check.allowed) {
            allowed.push(column);
        } else {
            denied.push(column);
        }
    }

    return { allowed, denied };
}

/**
 * Apply RLS filter to WHERE clause
 */
export function applyRLSFilter(
    whereClause: Record<string, unknown> | undefined,
    rlsFilter: RLSFilter | undefined
): Record<string, unknown> {
    if (!rlsFilter) {
        return whereClause ?? {};
    }

    return {
        ...whereClause,
        ...rlsFilter
    };
}
