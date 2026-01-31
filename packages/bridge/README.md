# @santokit/bridge

Santokit Edge Server Runtime - A runtime-agnostic execution environment for Santokit logic handlers.

## Overview

`@santokit/bridge` provides a lightweight, edge-optimized server runtime that can run on:
- **Cloudflare Workers** (via KV + Hyperdrive)
- **Node.js / Docker** (via PostgreSQL + Redis)
- **AWS Lambda** (coming soon)
- Any **Standard Web API** compatible runtime

## Features

- 🚀 **Edge-first**: Optimized for edge runtimes with minimal cold start
- 🔌 **Runtime-agnostic**: Works on Cloudflare Workers, Node.js, Docker, and more
- 🔐 **Built-in auth**: JWT-based authentication and role-based access control
- 💾 **Flexible storage**: KV store abstraction (Cloudflare KV, Redis, or in-memory)
- 🗄️ **Database support**: PostgreSQL with connection pooling
- 📦 **Bundle execution**: Execute SQL and JavaScript logic bundles
- ⚡ **Caching**: Configurable response caching

## Installation

```bash
npm install @santokit/bridge
```

## Usage

### Cloudflare Workers

```typescript
import { createCloudflareServer } from '@santokit/bridge/adapters/cloudflare';

export default {
  async fetch(request: Request, env: CloudflareEnv): Promise<Response> {
    const server = createCloudflareServer(env);
    return server.fetch(request);
  },
};
```

**wrangler.toml:**
```toml
name = "my-santokit-server"
main = "src/index.ts"

[[kv_namespaces]]
binding = "SANTOKIT_KV"
id = "your-kv-namespace-id"

[[hyperdrive]]
binding = "SANTOKIT_DB"
id = "your-hyperdrive-config-id"

[vars]
SANTOKIT_PROJECT_ID = "your-project-id"
SANTOKIT_ENCRYPTION_KEY = "your-32-byte-encryption-key"
```

### Node.js / Docker

```typescript
import { createNodeServer } from '@santokit/bridge/adapters/node';

const env = {
  port: 3000,
  databaseUrl: process.env.DATABASE_URL!,
  projectId: process.env.SANTOKIT_PROJECT_ID!,
  encryptionKey: process.env.SANTOKIT_ENCRYPTION_KEY!,
  redisUrl: process.env.REDIS_URL, // Optional, uses in-memory if not provided
};

const { start } = await createNodeServer(env);
await start();
```

## Architecture

### Core Components

1. **SantokitServer**: Main server class handling request routing and execution
2. **Context**: Runtime API provided to logic handlers (db, storage, invoke, etc.)
3. **Adapters**: Platform-specific implementations (Cloudflare, Node.js)
4. **Logic Execution**: Supports both SQL and JavaScript bundles

### Request Flow

```
Request → Server.fetch() → Load Bundle → Auth Check → Execute Logic → Response
```

### Bundle Format

Bundles are stored in KV with the following structure:

```typescript
interface Bundle {
  type: 'sql' | 'js';
  namespace: string;
  name: string;
  config: LogicConfig;
  content: string;
  hash: string;
}
```

## API

### Context API (Available in Logic Handlers)

```typescript
interface Context {
  // Database operations
  db: {
    query(target: string, sql: string, params?: unknown[]): Promise<unknown[]>;
    queryDefault(sql: string, params?: unknown[]): Promise<unknown[]>;
  };
  
  // Storage operations
  storage: {
    createUploadUrl(bucket: string, path: string, options?: UploadOptions): Promise<string>;
    createDownloadUrl(bucket: string, path: string, options?: DownloadOptions): Promise<string>;
    delete(bucket: string, path: string): Promise<void>;
  };
  
  // Invoke other logic endpoints
  invoke(path: string, params?: Record<string, unknown>): Promise<unknown>;
  
  // Current request information
  request: RequestInfo;
  
  // Get secret values
  getSecret(key: string): Promise<string | undefined>;
}
```

### Logic Configuration

```typescript
interface LogicConfig {
  target?: string;                    // Database alias (default: "main")
  params?: Record<string, ParamConfig>; // Parameter definitions
  access?: string;                     // "public", "authenticated", or role name
  cache?: string;                      // Cache duration (e.g., "5m", "1h", "1d")
  sql?: string;                        // SQL query (for SQL-based logic)
  handler?: LogicHandler;              // Handler function (for JS-based logic)
}
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm test
```

## License

MIT
