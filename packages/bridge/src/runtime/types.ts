/**
 * LogicHandler represents a business logic handler function.
 */
export type LogicHandler = (
  params: Record<string, unknown>,
  context: import('../context/index.js').Context
) => Promise<unknown>;

/**
 * LogicConfig represents the configuration for a logic endpoint.
 */
export interface LogicConfig {
  /** Target database alias (e.g., "main", "logs") */
  target?: string;

  /** Parameter definitions */
  params?: Record<string, ParamConfig>;

  /** Access control: "public", "authenticated", or role name */
  access?: string;

  /** Cache duration (e.g., "5m", "1h", "1d") */
  cache?: string;

  /** SQL query (for SQL-based logic) */
  sql?: string;

  /** Handler function (for JS-based logic) */
  handler?: LogicHandler;
}

/**
 * ParamConfig defines a parameter's schema
 */
export interface ParamConfig {
  type: 'string' | 'int' | 'bool' | 'json';
  required?: boolean;
  default?: unknown;
}

/**
 * RequestInfo contains information about the incoming request
 */
export interface RequestInfo {
  /** Request method */
  method: string;

  /** Request path (namespace/name) */
  path: string;

  /** Request headers */
  headers: Headers;

  /** Authenticated user info (if any) */
  user?: UserInfo;

  /** Request ID for tracing */
  requestId: string;
}

/**
 * UserInfo represents an authenticated user
 */
export interface UserInfo {
  id: string;
  email?: string;
  roles: string[];
}

/**
 * Bundle represents a loaded logic bundle from Edge KV
 */
export interface Bundle {
  type: 'sql' | 'js';
  namespace: string;
  name: string;
  config: LogicConfig;
  content: string;
  hash: string;
}

/**
 * CRUD operation types
 */
export type CRUDOperation = 'select' | 'insert' | 'update' | 'delete';

/**
 * Column prefix types for sensitivity levels
 */
export type ColumnPrefix = 's_' | 'c_' | 'p_' | '_' | null;

/**
 * Permission role types
 */
export type PermissionRole = 'public' | 'authenticated' | 'owner' | string;

/**
 * Row-Level Security filter
 */
export interface RLSFilter {
  [key: string]: unknown;
}

/**
 * Column-level permissions
 */
export interface ColumnPermissions {
  select?: PermissionRole[];
  update?: PermissionRole[];
  insert?: PermissionRole[];
}

/**
 * Table-level permissions
 */
export interface TablePermissions {
  select?: PermissionRole[];
  insert?: PermissionRole[];
  update?: PermissionRole[];
  delete?: PermissionRole[];
  columns?: Record<string, ColumnPermissions>;
}

/**
 * Owner column configuration
 */
export interface OwnerColumnConfig {
  _default?: string;
  [tableName: string]: string | undefined;
}

/**
 * Permissions configuration
 */
export interface PermissionsConfig {
  ownerColumn?: OwnerColumnConfig;
  tables?: {
    _default?: TablePermissions;
    [tableName: string]: TablePermissions | undefined;
  };
}

/**
 * Permission check result
 */
export interface PermissionCheckResult {
  allowed: boolean;
  rlsFilter?: RLSFilter;
  reason?: string;
}
