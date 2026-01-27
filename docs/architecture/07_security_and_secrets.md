# 07. Security & Secrets

## Secret Management Strategy
**"Secrets are for the Vault, not the Repo."**

### 1. Isolation
*   Never write secrets in `santoki/*.yaml` or `.hcl`.
*   Never check secrets into Git.
*   Local `.env` files are discouraged/managed strictly by `stk dev`.

### 2. Injection Flow
1.  **Definition**: In `auth.yaml`, use `${GOOGLE_CLIENT_SECRET}`.
2.  **Storage**: User runs `stk secret set GOOGLE_CLIENT_SECRET "xyz"`. Value goes to Hub Vault (Encrypted).
3.  **Deployment**:
    *   Hub retrieves secret from Vault.
    *   Re-encrypts it with **Project Master Key** (shared with Edge).
    *   Bundles into the Config JSON in Edge KV.
4.  **Runtime**: Edge Server decrypts the value in memory just before use.

## Authentication (User-Facing)
*   **Providers**: Defined in `base/auth.yaml` (Google, GitHub, Email/Pass).
*   **Session**: Managed by Santoki (JWT/Sessions).
*   **RBAC**:
    *   Roles defined in `auth.yaml`.
    *   Logic files specify `access: "admin"` or `access: "authenticated"`.
    *   Server validates this access *before* executing logic.

## Infrastructure Security
*   **DB Connections**:
    *   Hub connects via IP-whitelisted migration runners (Atlas).
    *   Edge connects via secure tunneling or authorized proxies (Hyperdrive).
*   **Edge Token**: The Edge runs on a restricted environment with a rotation-capable token to access KV and other resources.
