# @santokit/bridge

Santokit Edge Server Runtime. This package is the execution layer that runs your deployed logic close to users, exposes the HTTP API, and connects to storage systems (DB, cache, KV) depending on the runtime adapter.

## When You Use This

- You want to **host** Santokit logic (SQL/JS) on an edge or server runtime.
- You want a **runtime-agnostic** HTTP server that can run on Cloudflare Workers or Node.js/Docker.
- You need the **/call** API that the Santokit Client SDK talks to.

## How It Fits In The System

- `stk` bundles logic and publishes a manifest to the Hub.
- The Hub stores the manifest and serves it to the Bridge at runtime.
- The Bridge executes logic and exposes a stable HTTP API.
- The Client SDK calls the Bridge API using type-safe methods.

## Supported Runtimes

- Cloudflare Workers (KV + Hyperdrive)
- Node.js / Docker (PostgreSQL + Redis)
- AWS Lambda (planned)
- Any Standard Web API compatible runtime

## Core API

The Bridge exposes a minimal HTTP API that is stable across adapters.

### Health Check

- `GET /health`
- Response: `200 OK`

### Logic Execution

- `POST /call`
- Headers:
  - `Content-Type: application/json`
  - `Authorization: Bearer <token>` (if logic is private)
- Body:

```json
{
  "path": "namespace/name",
  "params": {
    "key": "value"
  }
}
```

- Response: The result of the logic execution.

### CRUD Operations

- `POST /call`
- Body:

```json
{
  "path": "crud/{database}/{table}/{operation}",
  "params": {
    "where": { "...": "..." },
    "data": { "...": "..." }
  }
}
```

- Operations: `select`, `insert`, `update`, `delete`

## Caching Behavior

The Bridge can cache responses based on logic configuration.

- Public `POST` requests can be cached via synthetic `GET` keys if a TTL is configured.
- `Cache-Control` headers are set based on the logic `cache` setting.

## Environment Variables

### Node.js / Docker

- `PORT`: HTTP port (default `3000`)
- `DATABASE_URL`: PostgreSQL connection string
- `SANTOKIT_PROJECT_ID`: Project ID served by this runtime
- `SANTOKIT_ENCRYPTION_KEY`: 32-byte key for AES-256-GCM
- `REDIS_URL`: Redis URL for KV (optional, in-memory if not set)

### Optional Runtime Settings

- `LOG_LEVEL`: `debug` or `info` (default `info`)
- `STORAGE_ENDPOINT`: Storage endpoint for presigned URLs
- `STORAGE_ACCESS_KEY_ID`: Storage access key
- `STORAGE_SECRET_ACCESS_KEY`: Storage secret key
- `STORAGE_REGION`: Storage region (default `auto`)
- `STK_PERMISSIONS_CONFIG`: Inline JSON permissions config
- `STK_PERMISSIONS_CONFIG_PATH`: File path to permissions config JSON

### Cloudflare Bindings

- `SANTOKIT_KV`: KV namespace binding
- `SANTOKIT_DB`: Hyperdrive binding
- `SANTOKIT_PROJECT_ID`: Project ID
- `SANTOKIT_ENCRYPTION_KEY`: 32-byte key for AES-256-GCM

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

Example `wrangler.toml` bindings:

```toml
name = "my-santokit-server"
main = "node_modules/@santokit/bridge/dist/adapters/cloudflare.js"

[[kv_namespaces]]
binding = "SANTOKIT_KV"
id = "your-kv-namespace-id"

[[hyperdrive]]
binding = "SANTOKIT_DB"
id = "your-hyperdrive-config-id"
```

### Node.js / Docker

```typescript
import { createNodeServer } from '@santokit/bridge/adapters/node';

const env = {
  port: 3000,
  databaseUrl: process.env.DATABASE_URL!,
  projectId: process.env.SANTOKIT_PROJECT_ID!,
  encryptionKey: process.env.SANTOKIT_ENCRYPTION_KEY!,
  redisUrl: process.env.REDIS_URL,
};

const { start } = await createNodeServer(env);
await start();
```

Example `.env` for local development:

```bash
PORT=3000
DATABASE_URL=postgres://localhost:5432/santokit
SANTOKIT_PROJECT_ID=default
SANTOKIT_ENCRYPTION_KEY=32-byte-key-for-aes-256-gcm!!!!!
REDIS_URL=redis://localhost:6379
```

## Example Requests

Health check:

```bash
curl -s http://localhost:3000/health
```

Call logic:

```bash
curl -s http://localhost:3000/call \
  -H 'Content-Type: application/json' \
  -d '{"path":"users/get","params":{"id":"123"}}'
```

## Development

```bash
npm install
npm run build
npm run dev
```

## Package Structure

- `src/runtime/`: Core request handling and execution pipeline
- `src/adapters/`: Cloudflare and Node adapters
- `src/context/`: DB, storage, and invocation context

## Troubleshooting

- If logic calls fail, verify the Hub URL and project ID used by the runtime.
- If database queries fail, verify `DATABASE_URL` and network access.
- If caching is unexpected, verify the logic `cache` configuration.
