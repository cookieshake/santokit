# Santokit Hub

The central control plane for the Santokit ecosystem. The Hub orchestrates projects, manages schemas, handles configuration, and securely stores secrets.

## Overview

Santokit Hub serves as the administrative core, providing APIs for:
- **Project Registry**: Tracking all active projects and their metadata.
- **Schema Registry**: Managing database schema versions and migrations via Atlas.
- **Configuration Management**: Storing and serving dynamic project configurations.
- **Vault Service**: Securely storing and retrieving sensitive environment variables and secrets.

## Architecture

The Hub is a Go-based service using:
- **Registry Service**: For project meta-data.
- **Vault Service**: Encrypted storage for secrets.
- **Schema Service**: Integration with Atlas for schema management.
- **SQL Store**: Persistent storage for all service data.

## API Reference

The Hub runs on `http://localhost:8080` (default) and exposes a REST API.

### Authentication (`/api/v1/auth`)
- `POST /login`: authenticate with email/password.
- `POST /register`: create a new user account.
- `GET /me`: get current user profile.

### Projects (`/api/v1/projects`)
- `GET /`: List all projects for the authenticated user.
- `POST /`: Create a new project.
  - Body: `{ "name": "string", "description": "string", "team_id": "string" }`
- `GET /{id}`: Get details for a specific project.

### Manifest (`/api/v1/manifest`)
- `GET /`: Retrieve the current active logic manifest (deployment bundle).
- `POST /`: Push a new manifest (used by `stk logic apply`).

### Secrets Vault (`/api/v1/secrets`)
- `GET /`: List all secret keys (values are not returned).
- `POST /`: Set a secret value.
  - Body: `{ "key": "string", "value": "string" }`
- `DELETE /{key}`: Delete a secret.

### Schema Engine (`/api/v1/schema`)
- `POST /plan`: Calculate migration plan.
- `POST /apply`: Execute schema migration.

### Configuration (`/api/v1/config`)
- `GET /`: Retrieve project runtime configuration.
- `POST /apply`: Update configuration.

## Getting Started

### Prerequisites

- Go 1.21+
- PostgreSQL (for storage)

### Running Locally

```bash
# Navigate to the Hub package
cd packages/hub

# Install dependencies
go mod download

# Start the server
go run cmd/hub/main.go
```

Configuration is handled via environment variables or a config file (see `internal/config`).
