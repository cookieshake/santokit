# @santokit/bridge

Santokit Edge Server Runtime - A runtime-agnostic execution environment for Santokit logic handlers.

## Overview

`@santokit/bridge` provides a lightweight, edge-optimized server runtime that can run on:
- **Cloudflare Workers** (via KV + Hyperdrive)
- **Node.js / Docker** (via PostgreSQL + Redis)
- **AWS Lambda** (coming soon)
- Any **Standard Web API** compatible runtime

## API Reference

The Bridge Server exposes a simple, functional HTTP API.

### Health Check
- `GET /health`
- **Response**: `200 OK`

### Logic Execution
Execute a deployed serverless function (JavaScript or SQL).

- **Endpoint**: `POST /call`
- **Headers**:
  - `Content-Type: application/json`
  - `Authorization: Bearer <token>` (if logic is private)
- **Body**:
  ```json
  {
    "path": "namespace/name",
    "params": {
      "key": "value"
    }
  }
  ```
- **Response**: The result of the logic execution.

### CRUD Operations
Execute direct database operations via the Bridge (subject to permissions).

- **Endpoint**: `POST /call`
- **Body**:
  ```json
  {
    "path": "crud/{database}/{table}/{operation}",
    "params": {
      "where": { ... },
      "data": { ... }
    }
  }
  ```
- **Operations**: `select`, `insert`, `update`, `delete`.

### Caching
The Bridge automatically handles response caching based on logic configuration.
- Public `POST` requests can be cached via synthetic `GET` keys if the logic defines a TTL.
- Headers: `Cache-Control` will differ based on the logic's `cache` setting (e.g., `5m`, `1h`).

## Features

- 🚀 **Edge-first**: Optimized for edge runtimes with minimal cold start
- 🔌 **Runtime-agnostic**: Works on Cloudflare Workers, Node.js, Docker, and more
- 🔐 **Built-in auth**: JWT-based authentication and role-based access control
- 💾 **Flexible storage**: KV store abstraction (Cloudflare KV, Redis, or in-memory)
- 🗄️ **Database support**: PostgreSQL with connection pooling
- 📦 **Bundle execution**: Execute SQL and JavaScript logic bundles

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
