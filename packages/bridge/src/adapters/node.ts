/**
 * Node.js / Docker Adapter for Santokit Server
 * 
 * This adapter allows Santokit Server to run as a standalone Node.js server,
 * suitable for Docker deployments or local development.
 */

import { SantokitServer, type ServerConfig, type KVStore, type DatabasePool } from '../index.js';
import { createClient } from 'redis';
import pg from 'pg';

/**
 * Node.js environment configuration
 */
export interface NodeEnv {
  /** Port to listen on (default: 3000) */
  port?: number;
  
  /** PostgreSQL connection string */
  databaseUrl: string;
  
  /** Project ID */
  projectId: string;
  
  /** Encryption key for secrets (32 bytes) */
  encryptionKey: string;
  
  /** Redis URL for KV storage (optional, uses in-memory if not provided) */
  redisUrl?: string;
}

/**
 * In-memory KV store for development
 */
class InMemoryKVStore implements KVStore {
  private store: Map<string, string> = new Map();

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.store.set(key, value);
  }
}

/**
 * Create a KV store (Redis or in-memory)
 */
async function createKVStore(redisUrl?: string): Promise<KVStore> {
  if (redisUrl) {
    const client = createClient({ url: redisUrl });
    client.on('error', (err) => {
      console.error('Redis client error:', err);
    });
    await client.connect();
    return {
      get: async (key: string) => {
        return await client.get(key);
      },
      put: async (key: string, value: string) => {
        await client.set(key, value);
      },
    };
  }
  
  return new InMemoryKVStore();
}

/**
 * Create a PostgreSQL database pool
 */
function createDbPool(connectionString: string): DatabasePool {
  const pool = new pg.Pool({ connectionString });
  return {
    query: async (sql: string, params?: unknown[]) => {
      try {
        const result = await pool.query(sql, params);
        return result.rows;
      } catch (error) {
        console.error('Database query error:', error);
        throw error;
      }
    },
  };
}

/**
 * Create and start a Santokit Server for Node.js
 */
export async function createNodeServer(env: NodeEnv): Promise<{
  server: SantokitServer;
  start: () => Promise<void>;
}> {
  const kv = await createKVStore(env.redisUrl);
  
  const config: ServerConfig = {
    projectId: env.projectId,
    kv,
    db: {
      main: createDbPool(env.databaseUrl),
    },
    encryptionKey: env.encryptionKey,
  };

  const server = new SantokitServer(config);
  const port = env.port ?? 3000;

  return {
    server,
    start: async () => {
      // Use Node.js built-in fetch handler (Node 18+)
      const { createServer } = await import('node:http');
      
      const httpServer = createServer(async (req, res) => {
        const url = `http://localhost:${port}${req.url}`;
        const headers = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
          if (value) {
            headers.set(key, Array.isArray(value) ? value[0] : value);
          }
        }

        const request = new Request(url, {
          method: req.method,
          headers,
          body: req.method !== 'GET' && req.method !== 'HEAD' ? req : undefined,
        });

        const response = await server.fetch(request);
        
        res.statusCode = response.status;
        response.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });
        
        const body = await response.text();
        res.end(body);
      });

      httpServer.listen(port, () => {
        console.log(`Santokit Server listening on http://localhost:${port}`);
      });
    },
  };
}

/**
 * CLI entry point for running the server
 */
export async function main(): Promise<void> {
  const env: NodeEnv = {
    port: parseInt(process.env.PORT ?? '3000'),
    databaseUrl: process.env.DATABASE_URL ?? 'postgres://localhost:5432/santokit',
    projectId: process.env.SANTOKIT_PROJECT_ID ?? 'default',
    encryptionKey: process.env.SANTOKIT_ENCRYPTION_KEY ?? '32-byte-key-for-aes-256-gcm!!!',
    redisUrl: process.env.REDIS_URL,
  };

  const { start } = await createNodeServer(env);
  await start();
}
