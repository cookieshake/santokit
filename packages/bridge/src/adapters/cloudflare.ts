/**
 * Cloudflare Workers Adapter for Santokit Server
 * 
 * This adapter integrates Santokit Server with Cloudflare Workers runtime,
 * using Cloudflare KV for bundle storage and Hyperdrive for database connections.
 */

import { SantokitServer, type ServerConfig, type KVStore, type DatabasePool } from '../index.js';
import { Client } from '@neondatabase/serverless';

/**
 * Cloudflare environment bindings
 */
export interface CloudflareEnv {
  /** Cloudflare KV namespace for bundles */
  SANTOKIT_KV: KVNamespace;
  
  /** Hyperdrive binding for database */
  SANTOKIT_DB: Hyperdrive;
  
  /** Project ID */
  SANTOKIT_PROJECT_ID: string;
  
  /** Encryption key for secrets */
  SANTOKIT_ENCRYPTION_KEY: string;
}

/**
 * Cloudflare KV Namespace interface
 */
interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

/**
 * Cloudflare Hyperdrive interface
 */
interface Hyperdrive {
  connectionString: string;
}

/**
 * Create a KVStore adapter for Cloudflare KV
 */
function createKVAdapter(kv: KVNamespace): KVStore {
  return {
    get: (key: string) => kv.get(key),
    put: (key: string, value: string) => kv.put(key, value),
  };
}

/**
 * Create a DatabasePool adapter for Hyperdrive
 * Note: This is a simplified implementation. In production, use a proper
 * PostgreSQL client that works in Workers (e.g., @neondatabase/serverless)
 */
function createDbAdapter(hyperdrive: Hyperdrive): DatabasePool {
  let client: Client | null = null;
  let connected = false;

  return {
    query: async (sql: string, params?: unknown[]) => {
      if (!client) {
        client = new Client(hyperdrive.connectionString);
      }
      if (!connected) {
        await client.connect();
        connected = true;
      }
      const result = await client.query(sql, params ?? []);
      return result.rows as unknown[];
    },
  };
}

/**
 * Create a Santokit Server configured for Cloudflare Workers
 */
export function createCloudflareServer(env: CloudflareEnv): SantokitServer {
  const config: ServerConfig = {
    projectId: env.SANTOKIT_PROJECT_ID,
    kv: createKVAdapter(env.SANTOKIT_KV),
    db: {
      main: createDbAdapter(env.SANTOKIT_DB),
    },
    encryptionKey: env.SANTOKIT_ENCRYPTION_KEY,
  };

  return new SantokitServer(config);
}

/**
 * Default export for Cloudflare Workers
 * 
 * Usage in wrangler.toml:
 * ```toml
 * name = "my-santokit-server"
 * main = "node_modules/@santokit/bridge/dist/adapters/cloudflare.js"
 * 
 * [[kv_namespaces]]
 * binding = "SANTOKIT_KV"
 * id = "your-kv-namespace-id"
 * 
 * [[hyperdrive]]
 * binding = "SANTOKIT_DB"
 * id = "your-hyperdrive-config-id"
 * ```
 */
export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const server = createCloudflareServer(env);
    return server.fetch(request);
  },
};
