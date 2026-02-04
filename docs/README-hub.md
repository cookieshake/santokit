# Santokit Hub

The central control plane for the Santokit ecosystem. The Hub manages projects, schemas, configuration, and secrets, and serves deployment manifests to the runtime.

## What The Hub Does

- Registers projects and environments.
- Stores deployment manifests produced by `stk logic apply`.
- Manages schema plans and applies migrations through Atlas.
- Stores configuration and secrets in an encrypted vault.
- Provides the API that the CLI and Bridge use.

## Architecture (High Level)

- REST API written in Go
- SQL store for persistent metadata
- Vault service for encrypted secrets
- Schema service integrated with Atlas

## API Surface (Summary)

Base URL: `http://localhost:8080` by default.

- `POST /api/v1/auth/login`
- `POST /api/v1/auth/register`
- `GET /api/v1/auth/me`
- `GET /api/v1/projects`
- `POST /api/v1/projects`
- `GET /api/v1/projects/{id}`
- `GET /api/v1/manifest`
- `POST /api/v1/manifest`
- `GET /api/v1/secrets`
- `POST /api/v1/secrets`
- `DELETE /api/v1/secrets/{key}`
- `POST /api/v1/schema/plan`
- `POST /api/v1/schema/apply`
- `GET /api/v1/config`
- `POST /api/v1/config/apply`

## Prerequisites

- Go 1.21+
- PostgreSQL (for Hub storage)

## Environment Variables

- `STK_HUB_ADDR`: Bind address (default `:8080`)
- `STK_DATABASE_URL`: Hub metadata database
- `STK_JWT_SECRET`: JWT signing secret
- `STK_ENCRYPTION_KEY`: 32-byte key for AES-256-GCM
- `STK_ATLAS_URL`: Atlas endpoint for schema operations
- `STK_KV_URL`: KV provisioning endpoint
- `STK_KV_TOKEN`: KV provisioning token
- `STK_AUTH_MODE`: Auth mode (default `local`)
- `STK_DISABLE_AUTH`: Set to `true` to disable auth in local dev

## Running Locally

```bash
cd packages/hub

go mod download

go run cmd/hub/main.go
```

Example local dev configuration:

```bash
export STK_DATABASE_URL=postgres://localhost:5432/santokit?sslmode=disable
export STK_JWT_SECRET=change-me-in-production
export STK_ENCRYPTION_KEY=32-byte-key-for-aes-256-gcm!!!!!
export STK_DISABLE_AUTH=true

go run cmd/hub/main.go
```

Configuration is provided via environment variables or a config file. See `internal/config` for details.

## Development

```bash
# Run tests

go test ./...
```

## Troubleshooting

- If the Hub fails to start, check database connectivity and credentials.
- If CLI authentication fails, verify the Hub base URL and auth settings.
