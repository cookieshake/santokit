# Santokit

**Backend infrastructure made simple.** Santokit abstracts away backend complexity so developers can focus on business logic and data schemas.

> 🚧 **Work in Progress** - This project is under active development.

## Philosophy

**Simple, Fast, Managed, and Open.**

- **Edge Computing** for zero-latency execution
- **No-Code-Gen** approach for seamless development experience
- **Open ecosystem** supporting external providers and self-hosting freedom

## Architecture

Santokit consists of 4 core components:

| Component | Language | Role | Description |
|-----------|----------|------|-------------|
| **CLI (`stk`)** | Go | Developer's local machine | Watches files, parses intent, communicates with Hub |
| **Hub** | Go | Central management server | Registry, Vault, Schema Engine, Provisioner, Console |
| **Server** | TypeScript | Edge Runtime | Executes logic close to users (Cloudflare Workers, Docker, Lambda) |
| **Client** | TypeScript | Frontend SDK | Provides typed SDK with full IntelliSense |

## Project Structure

```
santokit/
├── packages/
│   ├── cli/                 # stk CLI (Go)
│   │   ├── cmd/stk/         # Entry point
│   │   └── internal/
│   │       ├── commands/    # CLI commands (init, dev, push, sync, secret)
│   │       └── engine/      # Core engines
│   │           ├── scanner/      # File watching
│   │           ├── parser/       # HCL/YAML/SQL parsing
│   │           ├── integrator/   # Bundling
│   │           └── communicator/ # Hub API client
│   │
│   ├── hub/                 # Santokit Hub (Go)
│   │   ├── cmd/hub/         # Entry point
│   │   ├── api/             # HTTP handlers
│   │   └── internal/
│   │       ├── registry/    # Manifest storage
│   │       ├── vault/       # Secret encryption (AES-256-GCM)
│   │       ├── schema/      # Atlas integration
│   │       ├── provisioner/ # Edge KV deployment
│   │       └── console/     # Web UI API
│   │
│   ├── server/              # Edge Server (TypeScript)
│   │   └── src/
│   │       ├── runtime/     # Core server
│   │       ├── context/     # Context API (db, storage, invoke)
│   │       └── adapters/    # Cloudflare, Node.js adapters
│   │
│   └── client/              # Client SDK (TypeScript)
│       └── src/
│           ├── proxy/       # Proxy-based API calls
│           ├── auth/        # Authentication module
│           └── types/       # Configuration types
│
├── examples/
│   └── sample-project/      # Example user project
│       ├── base/            # DB schemas
│       ├── config/          # Project config (databases, auth, storage)
│       └── logic/           # Business logic (SQL, JS)
│
└── docs/
    └── architecture/        # Architecture documentation
```

## User Project Structure

When you create a Santokit project, it follows this structure:

```
my-project/
├── base/                    # Schema definitions
│   ├── main.hcl             # Database schema (alias: 'main')
├── config/                  # Project config
│   ├── databases.yaml        # Database connections
│   ├── auth.yaml            # Authentication config
│   └── storage.yaml         # Storage buckets config
│
└── logic/                   # Business logic
    ├── users/               # Namespace: users
    │   ├── get.sql          # Public: stk.logic.users.get()
    │   ├── update.js        # Public: stk.logic.users.update()
    │   └── _internal.sql    # Private: _ prefix, internal only
    │
    └── orders/
        ├── create.sql
        └── list.sql
```

## Quick Start

### Installation

```bash
# Install CLI
go install github.com/cookieshake/santokit/packages/cli/cmd/stk@latest

# Or build from source
cd packages/cli && go build -o stk ./cmd/stk
```

### Create a Project

```bash
# Initialize new project
stk init my-app
cd my-app

# Start development server
stk dev

# Deploy
stk schema plan # Plan schema changes
stk config apply # Apply project config
stk logic apply  # Deploy business logic

# Profiles
stk profile set local --hub-url http://localhost:8080 --project-id default --token test-token
stk profile use local
```

### Client SDK Usage

```typescript
import { createClient } from '@santokit/client';

const stk = createClient({
  baseUrl: 'https://api.myapp.com'
});

// Authentication
await stk.auth.login({ email: 'user@example.com', password: 'secret' });
const user = await stk.auth.me();

// Type-safe API calls (IntelliSense support)
const profile = await stk.logic.users.get({ id: user.id });
const orders = await stk.logic.orders.list({ limit: 10 });
```

## Development

### Prerequisites

- Go 1.22+
- Node.js 18+
- PostgreSQL 15+

### Building

```bash
# CLI
cd packages/cli && go build ./...

# Hub
cd packages/hub && go build ./...

# Server
cd packages/bridge && npm install && npm run build

# Client
cd packages/client && npm install && npm run build
```

### Testing

```bash
# Go packages
go test ./...

# TypeScript packages
npm test
```

## Documentation

See [docs/architecture/](docs/architecture/) for detailed architecture documentation:

1. [Architecture Overview](docs/architecture/01_architecture_overview.md)
2. [Directory Structure](docs/architecture/02_directory_structure.md)
3. [CLI Specification](docs/architecture/03_cli_specification.md)
4. [Hub and Vault](docs/architecture/04_hub_and_vault.md)
5. [Server and Edge](docs/architecture/05_server_and_edge.md)
6. [Client SDK](docs/architecture/06_client_sdk.md)
7. [Security and Secrets](docs/architecture/07_security_and_secrets.md)

## License

MIT
