# 04. Hub & Vault Specification

## Role
The "Control Plane". It manages state, security, and distribution. It does NOT execute user logic for production traffic.

## Architecture
*   **Language**: Go.
*   **Database**: System DB (PostgreSQL) for user accounts, projects, and version history.

## 3 Core Engines

### 1. Manifest Registry
*   Stores the "Source of Truth" for every project version.
*   **Logic Versioning**: Stores immutable snapshots of logic deployments.
*   **Schema History**: Tracks applied migrations via Atlas cloud or internal tracking.

### 2. Santoki-Vault (Security)
*   **Responsibility**: The only place where plaintext secrets exist (at rest, encrypted).
*   **Encryption**: AES-256-GCM.
*   **Input**: Via `stk secret set`.
*   **Output (Provisioning)**:
    *   When pushing to Server (Edge), secrets are re-encrypted with a shared Master Key known only to Hub and Server.
    *   Secrets are bundled into the "Provisioning Package".

### 3. Schema Executor (Atlas Integration)
*   Receives `base/*.hcl` content.
*   Calculates diff against current DB state (using Atlas).
*   Generates SQL migration plan.
*   Executes migration upon user approval.

## Provisioning Mechanism (The "Push" Strategy)
How the Edge knows what to do without asking Hub every time.

1.  **Event**: User runs `stk logic push`.
2.  **Build**: Hub validates and bundles the logic + decrypted-then-re-encrypted secrets + config.
3.  **Distribute**:
    *   Hub pushes this bundle to **Cloudflare KV (Edge Storage)**.
    *   Key: `project:{id}:latest`.
    *   Value: Compressed JSON/Binary containing all logic and metadata.
4.  **Result**: Edge nodes globally now have the latest definitions instantly available.

## Console (Web UI)
*   **Dashboard**: Project status, request volume, error rates.
*   **Data Explorer**: Since DB connections are managed, a simple SQL runner/viewer can be provided.
*   **Logs**: Aggregated logs from Edge workers.
*   **Team**: Member management (RBAC).
