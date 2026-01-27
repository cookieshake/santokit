# 01. Santoki Architecture Overview

## Core Philosophy
**"Simple, Fast, and Managed."**
Santoki (stk) is designed to abstract away the complexity of backend infrastructure, allowing developers to focus purely on business logic and data schema. It leverages Edge Computing for zero-latency execution and a "No-Code-Gen" approach for seamless development experience.

## The 4 Core Components

### 1. The CLI (`stk`)
*   **Location**: Developer's Local Machine.
*   **Role**: The "Hands and Feet". It watches files, parses intent, and communicates with the Hub.
*   **Key Responsibilities**:
    *   Scanning and parsing `base/` and `logic/` directories.
    *   Pushing logic and schema changes to the Hub.
    *   Injecting "Virtual Types" (`.d.ts`) into `node_modules`.
    *   Running the local development environment (`stk dev`).

### 2. The Hub (`Santoki-Hub`)
*   **Location**: Central Management Server (Go-based).
*   **Role**: The "Brain" and "Control Plane".
*   **Key Responsibilities**:
    *   **Registry**: Stores versions of logic (SQL/JS/WASM) and schema plans.
    *   **Vault**: Securely encrypts and stores secrets (DB credentials, API keys).
    *   **Schema Engine**: Uses Atlas to manage and migrate DB schemas safely.
    *   **Provisioner**: Pre-distributes logic and encrypted secrets to Edge KV for the Server to consume.
    *   **Console**: Web UI for monitoring, team management, and connection settings.

### 3. The Server (`Santoki-Server`)
*   **Location**: Edge Runtime (Cloudflare Workers or Standard Container + Type Script).
*   **Role**: The "Bridge" and "Muscle" (Data Plane).
*   **Key Responsibilities**:
    *   **Execution**: Validates auth and executes logic found in the Edge KV.
    *   **Zero-Latency**: Runs on the edge node closest to the user.
    *   **Security**: Decrypts DB credentials in-memory using environment keys.
    *   **Proxying**: Manages DB connections and object storage interactions.

### 4. The Client (`Santoki-Client`)
*   **Location**: Another Frontend Application (Browser/Node).
*   **Role**: The "Interface" and "Magic".
*   **Key Responsibilities**:
    *   **Virtual Typing**: Provides full IntelliSense without generating actual TS files in the source tree.
    *   **Proxy Calls**: Intercepts function calls and routes them to the Server.
    *   **Namespaces**:
        *   `stk.auth`: Identity management.
        *   `stk.files`: File upload/download.
        *   `stk.logic`: Business logic execution.

## Interaction Flow (The Lifecycle)

1.  **Develop**: User edits `logic/users/get.sql`. `stk` detects change.
2.  **Deploy (`stk push`)**: `stk` parses files, validates YAML, and uploads to Hub.
3.  **Provision**: Hub validates logic, encrypts necessary secrets, and pushes the package to **Edge KV**.
4.  **Sync (`stk sync`)**: `stk` downloads the API manifest from Hub and updates `node_modules/@santoki/client` for autocomplete.
5.  **Runtime**: Frontend calls `stk.logic.users.get()`.
    *   Edge Server receives request.
    *   Fetches logic + encrypted config from local **Edge KV**.
    *   Decrypts config, connects to DB, executes SQL/WASM.
    *   Returns result to Client.
