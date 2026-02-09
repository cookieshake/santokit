# Missing Features & Discrepancies (Plan vs. Implementation)

This document tracks features described in the `plan/` directory but are currently missing or incomplete in the `packages/` source code.

---

## Core Permissions & Security

### 1. Auto CRUD CEL Permissions (Row-Level Security)
- **Spec (`plan/spec/crud.md`)**: Supports dynamic conditions based on `request.auth.roles` or `request.params.*`. Patterns like `resource.<column> == request.auth.sub` should be safely translated to SQL WHERE clauses.
- **Status**: Currently, the `PermissionEvaluator` only handles hardcoded owner check patterns (e.g., `resource.id == request.auth.sub`). Generic `resource.*` conditions return an error stating that SQL translation is required but not implemented.

### 2. General `resource.*` Conditions in CEL
- **Spec (`plan/spec/crud.md`)**: Supports patterns like `resource.status == "active"` for dynamic row filtering.
- **Status**: The `evaluate_condition` function in `evaluator.rs` explicitly returns an error for `resource.*` patterns that are not the standard owner-check pattern. These require full CEL-to-SQL translation which is not yet implemented.

---

## Schema & Type Validation

### 3. Recursive Array Type Validation
- **Spec (`plan/spec/crud.md`)**: During Insert/Update, `type: array` columns must have their elements recursively validated against the `items` type defined in the schema.
- **Status**: The Bridge (`handle_auto_crud`) and SQL builders lack logic to perform deep type validation for array elements before database operations.

### 4. `decimal` Type Precision Handling
- **Spec (`plan/spec/schema.md`)**: `decimal` type is for "fixed-point (financial, etc.)" requiring precision guarantees. JSON should use `string` representation.
- **Status**: No explicit validation exists to ensure `decimal` columns receive string values in JSON or that precision parameters are properly handled.

### 5. Primary Key Constraints Enforcement
- **Spec (`plan/spec/schema.md`)**: Composite keys are forbidden; every table must have a single PK defined via `tables.<name>.id`. PK columns in `columns` section should trigger error.
- **Status**: While the parser structure supports this, there's no explicit validation preventing PK column redefinition in `columns` section.

---

## Multi-Engine & Database

### 6. Multi-Engine Abstraction
- **Spec (`plan/spec/final.md`, `schema.md`)**: The system should be engine-neutral, supporting Postgres as default but allowing for others.
- **Status**: The implementation is heavily coupled with PostgreSQL. The Hub's `apply_schema_to_postgres` and `stk-sql`'s use of `PostgresQueryBuilder` are specific to Postgres. There is no engine-agnostic trait or interface to plug in other databases.

### 7. Schema Drift-based Release Blocking
- **Spec (`plan/spec/schema.md`)**: If DB drift exists, release creation/promotion should be blocked.
- **Status**: `stk schema drift` CLI command exists, but the integration with `stk apply` to automatically block releases on drift is not fully verified/implemented.

---

## Custom Logic

### 8. Custom Logic Multi-statement & Transactions
- **Spec (`plan/spec/logics.md`)**: Supports explicit transactions (`BEGIN`, `COMMIT`) and multi-statement SQL execution within `.sql` logic files.
- **Status**: The Bridge uses `sqlx::query(...).fetch_all()` or `execute()`, which may only return the result of the last statement or fail to handle multi-statement results correctly depending on the driver configuration.

---

## Storage

### 9. Asynchronous Storage `onDelete: cascade`
- **Spec (`plan/spec/storage.md`)**: S3 object deletion should be performed as a background/asynchronous task (Best Effort policy). Should not block the API response.
- **Status**: `delete_s3_objects` runs sequentially within the `handle_auto_crud` handler using `.await`, potentially increasing API latency. Should be dispatched to `tokio::spawn` or a background worker.

---

## CLI Commands

### 10. Connection Rotation (`stk connections rotate`)
- **Spec (`plan/secrets/model.md`)**: `stk connections rotate --project <project> --env <env> --name <connection>` command for safe credential rotation.
- **Status**: Not implemented. CLI only has `set` and `test` for connections.

### 11. `stk apply --only` Granular Options
- **Spec (`plan/spec/cli.md`)**: `stk apply --only schema|permissions|release` for partial applies, `--only permissions,release` combinations.
- **Status**: CLI has `--only schema` option, but fine-grained combinations (e.g., `--only permissions,release`) may not be fully supported.

### 12. `stk apply` Idempotency with `releaseId` Reuse
- **Spec (`plan/spec/cli.md`, `final.md`)**: If input snapshot is identical, Hub should return existing `releaseId` instead of creating new one.
- **Status**: Idempotency logic exists (`find_release_by_hash`), but edge cases around snapshot hash computation need verification.

---

## Authentication & Authorization

### 13. PASETO `kid` Header for Key Rotation
- **Spec (`plan/spec/auth.md`)**: Token header should include `kid` for key identification during rolling deployment.
- **Status**: `issue_access_token` in Hub creates PASETO tokens but `kid` inclusion in the token header needs verification. `extract_kid` function exists in core but may not be fully utilized.

### 14. End User Roles Update Propagation
- **Spec (`plan/spec/auth.md`)**: Since `roles` are included in access token, role changes require token re-issuance or short TTL.
- **Status**: No mechanism exists to invalidate existing tokens when End User roles are updated. Only refresh token revocation is available.

### 15. Multi-Project Cookie Namespace Isolation
- **Spec (`plan/flows/auth.md`)**: Same Hub domain serving multiple projects should use namespaced cookies (`stk_access_<project>_<env>`).
- **Status**: Cookie namespacing is implemented, but Bridge's cookie extraction logic needs to properly handle the namespaced cookie selection based on request context headers.

---

## Audit & Observability

### 16. Audit Logging Completeness
- **Spec (`plan/spec/final.md`)**: Centralized audit log for releases, permission changes, connection updates.
- **Status**: Audit API exists, but comprehensive coverage verification needed for all Hub operations (connection set, OIDC provider changes, schema applies, etc.).

---

## Expand / Relations

### 17. Expand Depth Limitation Enforcement
- **Spec (`plan/spec/crud.md`)**: Only 1-depth expand is supported (nested expand is out of scope).
- **Status**: While nested expand isn't implemented, there's no explicit error message when a user attempts nested expand syntax.

---

## Rate Limiting / Security

### 18. Rate Limit Cleanup/Expiry
- **Spec**: Implicit requirement for rate limiting to not accumulate stale data.
- **Status**: `rate_limits` table exists but no TTL-based cleanup mechanism for old entries. May lead to unbounded growth over time.
