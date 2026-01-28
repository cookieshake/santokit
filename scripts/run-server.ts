import { SantokiServer } from '../packages/server/src/index.ts';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as http from 'http';
import { homedir } from 'os';

// 1. Implement File-System KV Store (Simulating Edge KV)
class FileKVStore {
  private dir: string;

  constructor() {
    this.dir = path.join(homedir(), '.santoki', 'tmp', 'kv');
  }

  async get(key: string): Promise<string | null> {
    try {
      // Key format: project:logic:namespace:name
      // We map this directly to filename
      const filePath = path.join(this.dir, key);
      const data = await fs.readFile(filePath, 'utf-8');
      return data;
    } catch (e) {
      return null;
    }
  }

  async put(key: string, value: string): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(path.join(this.dir, key), value);
  }
}

// 2. Implement Mock Database (for MVP)
const mockDb = {
  query: async (sql: string, params?: any[]) => {
    console.log(`[DB] Executing SQL: ${sql}`);
    console.log(`[DB] Params:`, params);
    
    // Return dummy data for users/get.sql
    return [{
      id: params?.[0] || '1',
      email: 'test@example.com',
      name: 'Test User',
      roles: ['user'],
      created_at: new Date().toISOString()
    }];
  }
};

// 3. Initialize Server
const server = new SantokiServer({
  projectId: 'default', // Must match CLI default
  kv: new FileKVStore(),
  db: {
    main: mockDb
  },
  encryptionKey: '32-byte-key-for-aes-256-gcm!!!!!'
});

// 4. Start HTTP Listener
const port = 3000;
const httpServer = http.createServer(async (req, res) => {
  console.log(`[Server] ${req.method} ${req.url}`);

  const url = `http://localhost:${port}${req.url}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
  }

  // Parse body
  let body: any = undefined;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    body = await new Promise((resolve) => {
      let data = '';
      req.on('data', chunk => data += chunk);
      req.on('end', () => resolve(data));
    });
  }

  const request = new Request(url, {
    method: req.method,
    headers,
    body: body
  });

  try {
    const response = await server.fetch(request);
    
    res.statusCode = response.status;
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    
    const respBody = await response.text();
    res.end(respBody);
  } catch (e) {
    console.error(e);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
});

httpServer.listen(port, () => {
  console.log(`
🚀 Santoki Edge Server running at http://localhost:${port}
   - KV Path: ${path.join(homedir(), '.santoki', 'tmp', 'kv')}
   - DB: Mocked (logs queries)
  `);
});
