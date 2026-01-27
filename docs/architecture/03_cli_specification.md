# 03. CLI Specification (`stk`)

## Role
The Intelligent Agent. Not just an uploader, but a parser, compiler, and synchronizer.

## 4 Core Engines
1.  **Scanner**: Watches `santoki/` for changes. Ignores `.gitignore` and `node_modules`.
2.  **Parser**: Extracts metadata (YAML) from files. Handles "Single-file" (comment parsing) and "Twin-file" (merging) strategies.
3.  **Integrator**: Manages `node_modules` modifications for Virtual Typing.
4.  **Communicator**: Authenticated client for Hub APIs.

## Key Commands

### `stk init`
*   Creates `santoki/` scaffolding.
*   Configures `.vscode/settings.json` for IntelliSense.
*   Links project to Hub via `stk.config.json` (stores project ID, not secrets).

### `stk dev` (The Local Bridge)
*   **Goal**: Zero-config local development.
*   **Actions**:
    1.  **Local DB**: Spins up Docker containers for defined DBs (or uses existing).
    2.  **Local Runtime**: Starts a lightweight Go-based local server simulating the Edge environment.
    3.  **Hot Reload**: Watches `logic/` and updates the local runtime instantly in-memory.
    4.  **Proxy**: Points `@santoki/client` to `localhost`.

### `stk base [push | plan]`
*   **Targeted Deployment**:
    *   `stk base push`: Checks all, plans changes.
    *   `stk base push db`: Only scans `.hcl` files.
    *   `stk base push auth`: Only scans `auth.yaml`.
    *   `stk base push main`: Only scans `main.hcl`.
*   **Safety**: Always runs a `plan` (dry-run) first. Shows diffs. Requires confirmation.

### `stk logic push`
*   Scans `logic/`.
*   Validates YAML schema locally (linting).
*   Bundles logic into a manifest.
*   Uploads to Hub.

### `stk sync`
*   Downloads the latest "Manifest" from Hub.
*   **Virtual Type Injection**:
    *   Locates `node_modules/@santoki/client/dist/index.d.ts`.
    *   Overwrites it with type definitions generated from the manifest.
    *   Enables `stk.logic.users.get(...)` autocomplete immediately.

### `stk secret set [KEY] [VALUE]`
*   Sends secret directly to Hub Vault (TLS).
*   Never writes to disk.

## Parsing logic (The Hybrid Approach)
1.  **Scan**: Walk `glue/` or `logic/`.
2.  **Match**:
    *   If `.sql` file found: Check for adjacent `.yaml` with same name.
    *   **Yes**: Merge YAML content with SQL body.
    *   **No**: Read SQL file's first block comment `/* --- ... --- */` as YAML.
3.  **Validate**: Check against JSON Schema. Fail hard with line numbers if invalid.
