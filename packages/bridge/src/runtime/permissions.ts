import type { PermissionsConfig, ColumnPrefix, PermissionRole, TablePermissions, ColumnPermissions } from './types.js';

/**
 * Default permissions based on column prefix
 */
const PREFIX_DEFAULTS: Record<Exclude<ColumnPrefix, null>, { select: PermissionRole[]; update: PermissionRole[] }> = {
    's_': {
        select: ['owner', 'admin'],
        update: ['owner', 'admin']
    },
    'c_': {
        select: ['admin'],
        update: ['admin']
    },
    'p_': {
        select: ['admin'],
        update: ['admin']
    },
    '_': {
        select: ['authenticated'],
        update: []
    }
};

/**
 * Parse column prefix from column name
 */
export function parseColumnPrefix(columnName: string): ColumnPrefix {
    if (columnName.startsWith('s_')) return 's_';
    if (columnName.startsWith('c_')) return 'c_';
    if (columnName.startsWith('p_')) return 'p_';
    if (columnName.startsWith('_')) return '_';
    return null;
}

/**
 * Get default permissions for a column based on its prefix
 */
export function getDefaultPermissionsByPrefix(prefix: ColumnPrefix): { select: PermissionRole[]; update: PermissionRole[] } {
    if (!prefix) {
        return {
            select: ['authenticated'],
            update: ['owner', 'admin']
        };
    }
    return PREFIX_DEFAULTS[prefix];
}

/**
 * Get table permissions from config
 */
export function getTablePermissions(
    config: PermissionsConfig,
    tableName: string
): TablePermissions {
    const tablePerms = config.tables?.[tableName];
    const defaultPerms = config.tables?._default;

    return {
        select: tablePerms?.select ?? defaultPerms?.select ?? ['authenticated'],
        insert: tablePerms?.insert ?? defaultPerms?.insert ?? ['authenticated'],
        update: tablePerms?.update ?? defaultPerms?.update ?? ['owner', 'admin'],
        delete: tablePerms?.delete ?? defaultPerms?.delete ?? ['admin'],
        columns: tablePerms?.columns ?? {}
    };
}

/**
 * Get column permissions from config or prefix defaults
 */
export function getColumnPermissions(
    config: PermissionsConfig,
    tableName: string,
    columnName: string
): ColumnPermissions {
    const tablePerms = getTablePermissions(config, tableName);
    const columnPerms = tablePerms.columns?.[columnName];

    if (columnPerms) {
        return columnPerms;
    }

    // Fall back to prefix-based defaults
    const prefix = parseColumnPrefix(columnName);
    const defaults = getDefaultPermissionsByPrefix(prefix);

    return {
        select: defaults.select,
        update: defaults.update,
        insert: prefix === '_' ? [] : undefined // System columns can't be inserted
    };
}

/**
 * Get owner column for a table
 */
export function getOwnerColumn(
    config: PermissionsConfig,
    tableName: string
): string {
    return config.ownerColumn?.[tableName] ?? config.ownerColumn?._default ?? 'user_id';
}

/**
 * Check if a column should be excluded from SELECT *
 */
export function shouldExcludeFromSelectAll(columnName: string): boolean {
    const prefix = parseColumnPrefix(columnName);
    return prefix === 'c_' || prefix === 'p_';
}

/**
 * Check if a column should be audited
 */
export function shouldAuditColumn(columnName: string): boolean {
    const prefix = parseColumnPrefix(columnName);
    return prefix === 'c_' || prefix === 'p_';
}

/**
 * Load permissions config from YAML (placeholder - actual implementation will load from KV/config)
 */
export function loadPermissionsConfig(): PermissionsConfig {
    // TODO: Load from KV or config file
    // For now, return default config
    return {
        ownerColumn: {
            _default: 'user_id'
        },
        tables: {
            _default: {
                select: ['authenticated'],
                insert: ['authenticated'],
                update: ['owner', 'admin'],
                delete: ['admin']
            }
        }
    };
}
