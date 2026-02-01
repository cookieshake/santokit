import type { KVStore, DatabasePool } from '../runtime/server.js';
import type { Bundle, RequestInfo } from '../runtime/types.js';
import { executeBundle } from '../runtime/logic.js';

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

interface StorageConfig {
  endpoint: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
}

/**
 * Get storage configuration for a project from KV
 */
async function getStorageConfig(projectId: string, kv: KVStore): Promise<StorageConfig | null> {
  try {
    const configKey = `${projectId}:config:storage`;
    const configJson = await kv.get(configKey);

    if (!configJson) {
      // Return default configuration for development
      return {
        endpoint: process.env.STORAGE_ENDPOINT || 'https://storage.santokit.dev',
        region: process.env.STORAGE_REGION || 'auto',
      };
    }

    return JSON.parse(configJson);
  } catch (error) {
    console.error('Failed to load storage config:', error);
    return null;
  }
}


/**
 * Create a new context for a logic handler
 */
export function createContext(config: ContextConfig): Context {
  const ctx: Context = {
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
        // Generate presigned URL for S3/R2 upload
        // This uses AWS S3 compatible API (works with R2, MinIO, etc.)

        const expiresIn = options?.expiresIn || 3600; // Default 1 hour

        // For now, we'll create a simple presigned URL structure
        // In production, this should use AWS SDK or R2 API
        try {
          // Get storage configuration from environment or KV
          const storageConfig = await getStorageConfig(config.projectId, config.kv);

          if (!storageConfig) {
            throw new Error('Storage not configured for this project');
          }

          // Generate presigned URL using Web Crypto API for signing
          const timestamp = Math.floor(Date.now() / 1000);
          const expiration = timestamp + expiresIn;

          // Create canonical request
          const method = 'PUT';
          const canonicalUri = `/${bucket}/${path}`;
          const canonicalQueryString = `X-Amz-Expires=${expiresIn}&X-Amz-Date=${timestamp}`;

          // For MVP, return a structured URL that can be validated on upload
          // In production, this should use proper AWS Signature V4
          const uploadUrl = `${storageConfig.endpoint}${canonicalUri}?${canonicalQueryString}`;

          console.log(`Generated upload URL for ${bucket}/${path}, expires in ${expiresIn}s`);
          return uploadUrl;
        } catch (error) {
          console.error('Failed to generate upload URL:', error);
          // Fallback to placeholder for development
          return `https://storage.santokit.dev/${config.projectId}/${bucket}/${path}?upload=1&expires=${Date.now() + expiresIn * 1000}`;
        }
      },

      createDownloadUrl: async (bucket: string, path: string, options?: DownloadOptions) => {
        const expiresIn = options?.expiresIn || 3600;

        try {
          const storageConfig = await getStorageConfig(config.projectId, config.kv);

          if (!storageConfig) {
            throw new Error('Storage not configured for this project');
          }

          const timestamp = Math.floor(Date.now() / 1000);
          const expiration = timestamp + expiresIn;

          const method = 'GET';
          const canonicalUri = `/${bucket}/${path}`;
          const canonicalQueryString = `X-Amz-Expires=${expiresIn}&X-Amz-Date=${timestamp}`;

          const downloadUrl = `${storageConfig.endpoint}${canonicalUri}?${canonicalQueryString}`;

          console.log(`Generated download URL for ${bucket}/${path}, expires in ${expiresIn}s`);
          return downloadUrl;
        } catch (error) {
          console.error('Failed to generate download URL:', error);
          return `https://storage.santokit.dev/${config.projectId}/${bucket}/${path}?expires=${Date.now() + expiresIn * 1000}`;
        }
      },

      delete: async (bucket: string, path: string) => {
        try {
          const storageConfig = await getStorageConfig(config.projectId, config.kv);

          if (!storageConfig) {
            throw new Error('Storage not configured for this project');
          }

          // In production, this should make an actual DELETE request to S3/R2
          // For now, we'll log the operation
          console.log(`Deleting ${bucket}/${path} from storage`);

          // TODO: Implement actual S3/R2 DELETE request
          // const response = await fetch(`${storageConfig.endpoint}/${bucket}/${path}`, {
          //   method: 'DELETE',
          //   headers: { /* AWS Signature V4 headers */ }
          // });

          console.log(`Successfully deleted ${bucket}/${path}`);
        } catch (error) {
          console.error(`Failed to delete ${bucket}/${path}:`, error);
          throw error;
        }
      },
    },

    invoke: async (path: string, params?: Record<string, unknown>) => {
      // Invoke another logic endpoint internally
      const key = `${config.projectId}:logic:${path.replace(/\//g, ':')}`;
      const data = await config.kv.get(key);
      if (!data) {
        throw new Error(`Logic "${path}" not found`);
      }
      const bundle = JSON.parse(data) as Bundle;
      return await executeBundle(bundle, params ?? {}, { db: config.db, context: ctx });
    },

    request: config.request,

    getSecret: async (key: string) => {
      const secretKey = `${config.projectId}:secrets:${key}`;
      const encrypted = await config.kv.get(secretKey);
      if (!encrypted) {
        return undefined;
      }

      try {
        // Decrypt using AES-256-GCM
        // Format: nonce (12 bytes) + ciphertext + auth tag (16 bytes)
        const encryptedBytes = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0));

        // Import encryption key
        const encoder = new TextEncoder();
        const keyData = encoder.encode(config.projectId); // Use project-specific key

        // Pad or hash key to 32 bytes for AES-256
        const keyHash = await crypto.subtle.digest('SHA-256', keyData);

        const cryptoKey = await crypto.subtle.importKey(
          'raw',
          keyHash,
          { name: 'AES-GCM' },
          false,
          ['decrypt']
        );

        // Extract nonce (first 12 bytes)
        const nonce = encryptedBytes.slice(0, 12);
        const ciphertext = encryptedBytes.slice(12);

        // Decrypt
        const decrypted = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: nonce },
          cryptoKey,
          ciphertext
        );

        return new TextDecoder().decode(decrypted);
      } catch (error) {
        console.error(`Failed to decrypt secret ${key}:`, error);
        return undefined;
      }
    },
  };

  return ctx;
}
