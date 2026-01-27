# 02. Directory Structure & Configuration

## Core Structure: Two-Level Depth
Santoki adheres to a strict "Simple is Best" philosophy. The structure is flattened to two main directories to avoid nesting hell while maintaining clear separation of concerns.

```text
santoki/
├── base/                # [Infrastructure] The Foundation
│   ├── main.hcl         # [DB Schema] Alias: 'main'
│   ├── logs.hcl         # [DB Schema] Alias: 'logs'
│   ├── auth.yaml        # [Policy] Authentication settings (Reserved Name)
│   └── storage.yaml     # [Policy] Storage buckets/permissions (Reserved Name)
└── logic/               # [Application] Business Logic
    ├── users/           # Namespace (folder name becomes validation namespace)
    │   ├── get.sql      # Logic file (Combined SQL + YAML Frontmatter)
    │   └── update.js    # Logic file (JS handler)
    └── orders/
        ├── create.yaml  # [Twin-File Mode] Metadata
        └── create.sql   # [Twin-File Mode] Pure SQL
```

## 1. `base/` Directory (Infrastructure)
Contains infrastructure-as-code definitions. Changes here are impactful and handled via `stk base push`.

*   **Multi-DB Strategy (File as Alias)**:
    *   `filename.hcl` directly maps to a DB alias.
    *   Example: `santoki/base/analytics.hcl` creates a DB resource referencable as `target: analytics` in logic files.
*   **Reserved Configuration Files**:
    *   `auth.yaml`: Identity providers, session rules, RBAC roles.
    *   `storage.yaml`: R2/S3 bucket definitions and access policies.

## 2. `logic/` Directory (Application)
Contains the actual functions executed by the server. Handled via `stk logic push`.

*   **File Formats**:
    *   **Single-File (Recommended)**: SQL/JS files with YAML Frontmatter in comments.
        *   Keeps file count low.
        *   Best for simple to medium complexity queries.
    *   **Twin-File (Optional)**: `name.yaml` + `name.sql`.
        *   Used for complex queries requiring extensive SQL or perfect IDE support.
        *   CLI automatically merges them if basenames match.

## 3. Configuration & IntelliSense
To ensure type safety and correctness in YAML configurations:

*   **JSON Schema**: The Hub hosts schemas (e.g., `api.santoki.com/schemas/auth.json`).
*   **Automatic VS Code Config**:
    *   `stk init` generates/updates `.vscode/settings.json`.
    *   Maps configurations to schemas automatically.
    ```json
    {
      "yaml.schemas": {
        "https://api.santoki.com/schemas/auth.json": "santoki/base/auth.yaml"
      }
    }
    ```

## 4. Secret Management rules
*   **Strict Separation**: Secrets NEVER go into `*.yaml` or `*.hcl` files.
*   **Placeholders**: Use `${VAR_NAME}` syntax in YAML/HCL.
*   **Vault**: Actual values are stored in Hub Vault via `stk secret set`.
