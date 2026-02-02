# Santokit CLI (`stk`)

The official command-line interface for managing Santokit projects. The CLI simplifies backend infrastructure management, schema definition, and deployment workflows.

## Features

- **Project Management**: Initialize (`init`) and configure projects easily.
- **Authentication**: Login (`login`) and manage profiles (`profile`) for secure access.
- **Schema Management**: Define and push database schemas (`schema`) declaratively.
- **Logic Deployment**: Deploy and validate serverless logic (`logic`).
- **Type Generation**: Automatically generate type-safe client SDKs (`sync`).
- **Secret Management**: Securely manage environment secrets (`secret`) via the Hub Vault.
- **Configuration**: Manage granular project settings (`config`).

## Installation

```bash
go install github.com/cookieshake/santokit/packages/cli/cmd/stk@latest
```

## Usage

```bash
stk <command> [flags]
```

## Command Reference

### `init`
Initialize a new Santokit project in the current directory.
- Creates a `moon.yml` or `stk.config.json` configuration.
- Scaffolds initial directory structure.
- **Flags**:
  - `--name`: Specify project name.

### `login`
Authenticate with the Santokit Hub via browser-based OAuth flow.
- Opens your default browser to the Hub login page.
- Stores session credentials locally.

### `project`
Manage projects in the Hub.
- `project list`: View all projects you have access to.
- `project create`: Create a new project.
  - `--name`: Project name.
  - `--team`: (Optional) Team ID to associate with.

### `logic`
Manage serverless logic bundles.
- `logic apply` (alias: `push`): Deploy local logic files to the Hub.
  - Scans `logic/` directory.
  - Bundles JS/SQL logic into a manifest.
  - Publishes to the Bridge runtime.
- `logic validate`: Dry-run validation of logic files without deploying.

### `schema`
Manage database schema definitions.
- `schema plan`: Compare local schema (Atlas/HCL) with the target database state.
- `schema apply`: Execute the planned migrations against the database.
  - Requires `STK_DATABASE_URL` or configuration in Hub.

### `secret`
Manage secure environment variables in the Hub Vault.
- `secret list`: List all keys for the current project.
- `secret set <key> <value>`: Store or update a secret.
- `secret delete <key>`: Remove a secret.

### `sync`
Download project manifest and generate type-safe Client SDK definitions.
- Fetches the latest deployment manifest.
- Generates `santokit-env.d.ts` (or configured output).
- **Configuration**: Reads `stk.config.json` for codegen targets.

### `config`
Manage local and remote project configuration.
- `config push`: Push local config to Hub.
- `config pull`: Fetch config from Hub.

## Environment Variables

- `STK_PROJECT_ID`: Target Project ID (overrides config).
- `STK_AUTH_TOKEN`: Manual authentication token (CI/CD).
- `STK_HUB_URL`: Custom Hub URL (for self-hosted).

## Development

To build the CLI from source:

```bash
# Clone the repository
git clone https://github.com/cookieshake/santokit.git

# Navigate to the CLI package
cd santokit/packages/cli

# Build the binary
go build -o stk ./cmd/stk
```
