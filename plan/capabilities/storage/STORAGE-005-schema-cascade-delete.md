---
id: STORAGE-005
domain: storage
title: Schema integration — cascade delete on file column
status: planned
depends: [STORAGE-003, CRUD-002]
spec_refs: ["plan/spec/storage.md", "plan/spec/schema.md"]
test_refs: []
code_refs: []
---

## Intent

Enables operators to declare `type: file` columns in `schema.yaml` so that when a row is deleted via the CRUD delete operation, Bridge automatically attempts to remove the associated S3 file. This reduces orphan file accumulation without requiring callers to perform a separate explicit delete.

## Execution Semantics

When a table column is declared with `type: file` and `onDelete: cascade`:

1. **Pre-delete data fetch** — Before executing the SQL `DELETE`, Bridge reads the current row(s) to retrieve the file key stored in the `type: file` column.
2. **SQL DELETE execution** — The row deletion proceeds as a normal CRUD-002 delete operation. The database transaction commits independently of the file deletion outcome.
3. **Async S3 deletion** — After the row is deleted, Bridge dispatches an asynchronous (background) `DeleteObject` call to S3 for each retrieved file key.
4. **Best-effort policy** — If the S3 deletion fails (network error, S3 error, or permission issue), Bridge logs the error but does not roll back the database transaction. The row is already deleted; the file may remain as an orphan.
5. **`onDelete: preserve`** — When the column declares `onDelete: preserve` (or omits `onDelete`), no S3 deletion is attempted. This is the default.

Schema declaration example:

```yaml
# config/schema.yaml
tables:
  users:
    columns:
      id:
        type: string
        id: ulid
      avatar_key:
        type: file
        bucket: main
        onDelete: cascade
      email:
        type: string
```

The cascade delete applies the same authorization model as the explicit `delete` operation (STORAGE-003): the storage policy's `delete` rule must exist and the request context must satisfy the role and CEL condition. If the request context lacks delete permission for the file's key, the S3 deletion is skipped (best-effort).

## Observable Outcome

After a successful `db/users/delete` call for a row with an `avatar_key` value of `avatars/123.jpg`:

- The row no longer appears in subsequent `db/users/select` queries.
- Bridge asynchronously issues an S3 `DeleteObject` for `avatars/123.jpg`.
- The HTTP response is returned to the caller immediately after the SQL commit, not after S3 deletion completes.
- If S3 deletion fails, the error is logged but the response is still HTTP 200.

## Usage

Schema declaration:

```yaml
# config/schema.yaml
tables:
  users:
    columns:
      id:
        type: string
        id: ulid
      avatar_key:
        type: file
        bucket: main
        onDelete: cascade
      email:
        type: string
```

Delete a user row (triggers cascade S3 file deletion for `avatar_key`):

```http
POST /call
Authorization: Bearer <jwt-for-admin>
Content-Type: application/json

{
  "path": "db/users/delete",
  "params": {
    "where": { "id": "01H8XYZABC123" }
  }
}
```

Response:

```json
{ "data": { "affected": 1 } }
```

Bridge asynchronously deletes the file at the path stored in `avatar_key` for the deleted row.

## Acceptance Criteria

- [ ] Deleting a row with a `type: file` column declared `onDelete: cascade` returns HTTP 200 with `{ "data": { "affected": N } }` and triggers an async S3 `DeleteObject` for the file key.
- [ ] The HTTP response is returned to the caller before the S3 deletion completes (async behavior).
- [ ] If the S3 deletion fails, Bridge logs the error but the HTTP response remains HTTP 200 (no rollback).
- [ ] Deleting a row with a `type: file` column declared `onDelete: preserve` (or no `onDelete`) does not trigger any S3 deletion.
- [ ] Deleting a row with a `null` value in the `type: file` column does not trigger S3 deletion (no key to delete).
- [ ] The CRUD delete safety gate still applies: a `where`-less delete returns HTTP 400 (CRUD-002 behavior).

## Failure Modes

- SQL DELETE succeeds but S3 DeleteObject fails: HTTP 200 is returned, error logged, file remains as orphan.
- `onDelete: preserve` declared: no S3 deletion attempted, no error.
- Missing or empty `where` clause in the CRUD delete call: HTTP 400 (CRUD-002 safety gate, no DB or S3 operation).
- No credential on request: HTTP 401.
- Caller role lacks permission for the target table delete: HTTP 403.
- Row's file key does not match any storage policy `delete` rule: S3 deletion skipped (best-effort), row still deleted.
