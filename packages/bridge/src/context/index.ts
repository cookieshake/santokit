import type { KVStore, DatabasePool } from '../runtime/server.js';
import type { RequestInfo } from '../runtime/types.js';

/**
 * Context provides the runtime API for logic handlers.
 */
export interface Context {
  /** Database operations */
  db: DbContext;
  
  /** Storage operations */
  storage: StorageContext;
  
  /** Invoke other logic endpoints */
  invoke: (path: string, params?: Record<string, unknown>) => Promise<unknown>;
  
  /** Current request information */
  request: RequestInfo;
  
  /** Get a secret value */
  getSecret: (key: string) => Promise<string | undefined>;
}

/**
 * DbContext provides database operations
 */
export interface DbContext {
  /** Execute a SQL query on the specified target */
  query: (target: string, sql: string, params?: unknown[]) => Promise<unknown[]>;
  
  /** Execute a SQL query on the default target */
  queryDefault: (sql: string, params?: unknown[]) => Promise<unknown[]>;
}

/**
 * StorageContext provides storage operations
 */
export interface StorageContext {
  /** Create a presigned upload URL */
  createUploadUrl: (bucket: string, path: string, options?: UploadOptions) => Promise<string>;
  
  /** Create a presigned download URL */
  createDownloadUrl: (bucket: string, path: string, options?: DownloadOptions) => Promise<string>;
  
  /** Delete a file */
  delete: (bucket: string, path: string) => Promise<void>;
}

export interface UploadOptions {
  /** URL expiration in seconds (default: 3600) */
  expiresIn?: number;
  /** Maximum file size in bytes */
  maxSize?: number;
  /** Allowed content types */
  contentTypes?: string[];
}

export interface DownloadOptions {
  /** URL expiration in seconds (default: 3600) */
  expiresIn?: number;
}

/**
 * ContextConfig holds configuration for creating a context
 */
export interface ContextConfig {
  db: Record<string, DatabasePool>;
  kv: KVStore;
  projectId: string;
  request: RequestInfo;
}

/**
 * Create a new context for a logic handler
 */
export function createContext(config: ContextConfig): Context {
  return {
    db: {
      query: async (target: string, sql: string, params?: unknown[]) => {
        const pool = config.db[target];
        if (!pool) {
          throw new Error(`Database "${target}" not configured`);
        }
        return pool.query(sql, params);
      },
      queryDefault: async (sql: string, params?: unknown[]) => {
        const pool = config.db['main'];
        if (!pool) {
          throw new Error('Default database "main" not configured');
        }
        return pool.query(sql, params);
      },
    },
    
    storage: {
      createUploadUrl: async (bucket: string, path: string, options?: UploadOptions) => {
        // TODO: Implement presigned URL generation
        void options;
        return `https://storage.santoki.dev/${config.projectId}/${bucket}/${path}?upload=1`;
      },
      createDownloadUrl: async (bucket: string, path: string, options?: DownloadOptions) => {
        // TODO: Implement presigned URL generation
        void options;
        return `https://storage.santoki.dev/${config.projectId}/${bucket}/${path}`;
      },
      delete: async (bucket: string, path: string) => {
        // TODO: Implement file deletion
        console.log(`Deleting ${bucket}/${path}`);
      },
    },
    
    invoke: async (path: string, params?: Record<string, unknown>) => {
      // Invoke another logic endpoint internally
      const key = `${config.projectId}:logic:${path.replace('/', ':')}`;
      const data = await config.kv.get(key);
      if (!data) {
        throw new Error(`Logic "${path}" not found`);
      }
      // TODO: Execute the loaded logic
      void params;
      return null;
    },
    
    request: config.request,
    
    getSecret: async (key: string) => {
      const secretKey = `${config.projectId}:secrets:${key}`;
      const encrypted = await config.kv.get(secretKey);
      if (!encrypted) {
        return undefined;
      }
      // TODO: Decrypt secret
      return encrypted;
    },
  };
}
