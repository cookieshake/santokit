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
        accessKeyId: process.env.STORAGE_ACCESS_KEY_ID,
        secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY,
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
        const expiresIn = options?.expiresIn || 3600; // Default 1 hour
        try {
          // Get storage configuration from environment or KV
          const storageConfig = await getStorageConfig(config.projectId, config.kv);

          if (!storageConfig) {
            throw new Error('Storage not configured for this project');
          }

          const uploadUrl = await createPresignedUrl('PUT', storageConfig, bucket, path, expiresIn);
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

          const downloadUrl = await createPresignedUrl('GET', storageConfig, bucket, path, expiresIn);
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
          const deleteUrl = await createPresignedUrl('DELETE', storageConfig, bucket, path, 900);
          const response = await fetch(deleteUrl, { method: 'DELETE' });
          if (!response.ok) {
            throw new Error(`Delete failed with status ${response.status}`);
          }
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

function encodePath(path: string): string {
  return path
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
}

function toAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const yyyy = date.getUTCFullYear().toString().padStart(4, '0');
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, '0');
  const dd = date.getUTCDate().toString().padStart(2, '0');
  const hh = date.getUTCHours().toString().padStart(2, '0');
  const min = date.getUTCMinutes().toString().padStart(2, '0');
  const ss = date.getUTCSeconds().toString().padStart(2, '0');
  const dateStamp = `${yyyy}${mm}${dd}`;
  const amzDate = `${dateStamp}T${hh}${min}${ss}Z`;
  return { amzDate, dateStamp };
}

async function sha256Hex(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function hmacSHA256(key: ArrayBuffer | string, value: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const keyBytes = typeof key === 'string' ? encoder.encode(key) : new Uint8Array(key);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value));
}

async function getSigningKey(secret: string, dateStamp: string, region: string): Promise<ArrayBuffer> {
  const kDate = await hmacSHA256(`AWS4${secret}`, dateStamp);
  const kRegion = await hmacSHA256(kDate, region);
  const kService = await hmacSHA256(kRegion, 's3');
  return hmacSHA256(kService, 'aws4_request');
}

function buildCanonicalQuery(params: Record<string, string>): string {
  const keys = Object.keys(params).sort();
  return keys
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join('&');
}

async function createPresignedUrl(
  method: string,
  storage: StorageConfig,
  bucket: string,
  path: string,
  expiresIn: number
): Promise<string> {
  if (!storage.accessKeyId || !storage.secretAccessKey) {
    throw new Error('Storage credentials not configured');
  }

  const endpoint = new URL(storage.endpoint);
  const host = endpoint.host;
  const { amzDate, dateStamp } = toAmzDate(new Date());
  const region = storage.region || 'auto';
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;

  const canonicalUri = `/${bucket}/${encodePath(path)}`;
  const queryParams: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${storage.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': `${expiresIn}`,
    'X-Amz-SignedHeaders': 'host',
  };

  const canonicalQueryString = buildCanonicalQuery(queryParams);
  const canonicalHeaders = `host:${host}\n`;
  const signedHeaders = 'host';
  const payloadHash = 'UNSIGNED-PAYLOAD';

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n');

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = await getSigningKey(storage.secretAccessKey, dateStamp, region);
  const signatureBytes = await hmacSHA256(signingKey, stringToSign);
  const signature = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const finalQuery = `${canonicalQueryString}&X-Amz-Signature=${signature}`;
  return `${endpoint.origin}${canonicalUri}?${finalQuery}`;
}
