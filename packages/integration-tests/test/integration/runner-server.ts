import { SantokiServer } from './packages/bridge/src/index.ts';
import * as http from 'http';
import { createClient } from 'redis';
import pg from 'pg';

// 1. Real Redis KV Store
class RedisKVStore {
  private client;

  constructor(url: string) {
    this.client = createClient({ url });
    this.client.on('error', (err) => console.error('Redis Client Error', err));
  }

  async connect() {
    await this.client.connect();
  }

  async get(key: string) {
    console.log(`[KV] Get ${key}`);
    const val = await this.client.get(key);
    console.log(`[KV] Result ${key}: ${val ? 'FOUND' : 'NULL'}`);
    return val;
  }

  async put(key: string, value: string) {
    await this.client.set(key, value);
  }
}

// 2. Real Postgres DB Pool
class PostgresPool {
  private pool;

  constructor(connectionString: string) {
    this.pool = new pg.Pool({ connectionString });
  }

  async query(sql: string, params?: any[]) {
    console.log(`[DB] Executing: ${sql} Params: ${params}`);
    try {
      const result = await this.pool.query(sql, params);
      return result.rows;
    } catch (e) {
      console.error('[DB] Error:', e);
      throw e;
    }
  }
}

async function start() {
  const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
  const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:password@postgres:5432/santoki';

  console.log(`Connecting to Redis: ${redisUrl}`);
  const kvStore = new RedisKVStore(redisUrl);
  await kvStore.connect();

  console.log(`Connecting to Postgres: ${dbUrl}`);
  const dbPool = new PostgresPool(dbUrl);

  // 3. Start Server
  const server = new SantokiServer({
    projectId: 'default',
    kv: kvStore,
    db: { main: dbPool },
    encryptionKey: process.env.STK_ENCRYPTION_KEY || '32-byte-key-for-aes-256-gcm!!!!!'
  });

  const port = 3000;
  http.createServer(async (req, res) => {
    const url = `http://localhost:${port}${req.url}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
    }
    
    let body: any = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await new Promise((r) => { let d = ''; req.on('data', c => d += c); req.on('end', () => r(d)); });
    }

    const request = new Request(url, { method: req.method, headers, body });
    try {
      const response = await server.fetch(request);
      res.statusCode = response.status;
      response.headers.forEach((v, k) => res.setHeader(k, v));
      res.end(await response.text());
    } catch (e) { 
      console.error(e);
      res.statusCode = 500; res.end('Internal Error'); 
    }
  }).listen(port, '0.0.0.0', () => {
    console.log('Santoki Test Server running on 3000');
  });
}

start().catch(console.error);
