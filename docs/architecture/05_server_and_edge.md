# 05. Server & Edge Specification (The Bridge)

## Role
The "Data Plane". Executes logic close to the user.

## Architecture: Hybrid (Go-WASM + Workers)
*   **Platform**: Cloudflare Workers (or compatible Edge Runtime).
*   **Core Logic**: Written in **Go**, compiled to **WebAssembly (WASM)**.
    *   Why? To maintain code consistency with Hub (if needed) and performance for complex parsing/routing mechanisms.
*   **Wrapper**: Thin JavaScript/TypeScript layer to bridge Workers API to the WASM core.

## Runtime Flow

1.  **Request**: `POST /call` comes in from Client.
2.  **Context Load (Zero-Latency)**:
    *   Server checks local memory cache for Project Config.
    *   If missing, reads from **Edge KV** (`project:{id}:latest`).
    *   *Note: Does NOT call Hub.*
3.  **Secret Hydration**:
    *   Config contains encrypted secrets (DB URL, API Keys).
    *   Server uses its Environment Variable (Master Key) to decrypt them in-memory.
4.  **Security Check**:
    *   Validates Session / JWT verification (using rules from `auth.yaml`).
5.  **Execution**:
    *   Router finds the logic function (e.g., `users/get.sql`).
    *   **SQL Logic**: Uses the **Connection Proxy** (e.g., Hyperdrive) to execute query against DB.
    *   **JS Logic**: Executes safe sandboxed JS.
6.  **Response**: returns JSON to client.

## Key Technologies
*   **Edge KV**: "Global Shared State". Stores logic code and configs.
*   **Connection Pooling (Hyperdrive)**: Critical for Edge. Maintains warm TCP connections to the database to prevent handshake latency and connection exhaustion.
*   **WASM**: Allows the complex "Santoki Engine" (YAML parsing, parameter validation) to be written efficiently in Go and run on JS workers.

## Local Runtime (stk dev)
*   mimics this exact behavior but runs as a local Go http server.
*   Reads `logic/` directly from disk instead of KV.
*   Uses local Docker DB instead of Hyperdrive.
