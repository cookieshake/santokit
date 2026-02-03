# Santokit CLI (`stk`)

The official command-line interface for managing Santokit projects. Use it to initialize projects, manage schemas, deploy logic, and sync types to your frontend.

## What The CLI Does

- Initializes a Santokit project layout.
- Authenticates to the Hub and manages profiles.
- Applies schema changes through Atlas.
- Publishes logic bundles to the Hub.
- Syncs type-safe client definitions.
- Manages secrets and configuration.

## Installation

```bash
go install github.com/cookieshake/santokit/packages/cli/cmd/stk@latest
```

## Quick Start

```bash
stk init my-app
cd my-app

stk login
stk project create --name my-app

stk schema plan
stk schema apply

stk logic apply
stk sync
```

## Usage

```bash
stk <command> [flags]
```

For details on any command:

```bash
stk help
stk <command> --help
```

## Command Overview

- `init`: Create a new project structure.
- `login`: Authenticate to the Hub.
- `project`: Manage projects in the Hub.
- `schema`: Plan and apply database schema changes.
- `logic`: Validate and deploy logic bundles.
- `secret`: Store and manage environment secrets.
- `sync`: Generate type-safe client definitions.
- `config`: Push and pull project configuration.
- `profile`: Manage named profiles for multiple Hub targets.

## Configuration Files

The CLI reads project configuration from:

- `stk.config.json`
- `moon.yml`

## Environment Variables

- `STK_PROJECT_ID`: Target project ID (overrides config)
- `STK_TOKEN`: Manual authentication token (CI/CD)
- `STK_HUB_URL`: Custom Hub URL (for self-hosted)

## Common Workflows

Create and use a named profile:

```bash
stk profile set local --hub-url http://localhost:8080 --project-id default --token test-token
stk profile use local
```

CI usage without interactive login:

```bash
export STK_HUB_URL=http://localhost:8080
export STK_PROJECT_ID=default
export STK_TOKEN=test-token

stk schema plan
stk schema apply
stk logic apply
stk sync
```

## Development

```bash
# Build the CLI binary
cd packages/cli

go build -o stk ./cmd/stk

# Run unit tests

go test ./...
```

## Related Components

- Santokit Hub: Central control plane service
- `@santokit/bridge`: Edge runtime server
- `@santokit/client`: Frontend SDK
