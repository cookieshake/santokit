---
id: STORAGE-003
domain: storage
title: Delete file from storage
status: planned
depends: [OPERATOR-001]
spec_refs: []
test_refs: []
code_refs: []
---

## Intent

Enables authenticated callers to delete a specific file from S3-compatible storage, subject to explicit policy authorization. Policies without a `delete` rule default to deny, making deletion opt-in per key pattern.

## Execution Semantics

Bridge processes a `delete` request as follows:

1. **Key validation** — The `key` parameter is normalized. Keys containing `..`, `//`, control characters, or a leading slash are rejected with HTTP 400.
2. **Policy matching** — The normalized key is matched against glob patterns in `config/storage.yaml`. If no policy matches, the request is denied with HTTP 403.
3. **Delete rule existence check** — If the matched policy exists but contains no `delete` rule, the request is denied with HTTP 403 (default deny). A `delete` rule must be explicitly declared.
4. **Role check** — The `delete` rule's `roles` list is checked (OR logic). If no role matches, the request is denied with HTTP 403.
5. **CEL condition evaluation** — If the `delete` rule defines a `condition`, Bridge evaluates the CEL expression with the request context. A non-`true` result is denied with HTTP 403.
6. **Storage deletion** — Bridge issues an S3 `DeleteObject` call. On success, HTTP 200 is returned.

Policy example from `config/storage.yaml` demonstrating owner-only delete with a path variable:

```yaml
policies:
  "docs/{userId}/*":
    upload_sign:
      roles: [authenticated]
      condition: "path.userId == request.auth.sub"
    download_sign:
      roles: [authenticated]
      condition: "path.userId == request.auth.sub || 'admin' in request.auth.roles"
    delete:
      roles: [authenticated]
      condition: "path.userId == request.auth.sub || 'admin' in request.auth.roles"
```

The `avatars/*` policy includes a `delete` rule requiring only authentication:

```yaml
  "avatars/*":
    delete:
      roles: [authenticated]
      condition: "request.auth.sub != ''"
```

## Observable Outcome

A caller with a valid credential satisfying the `delete` rule receives HTTP 200 after the file is removed from S3:

```json
{
  "data": {}
}
```

Subsequent attempts to access the deleted file via `download_sign` still succeed in issuing a presigned URL (S3 returns a 404 on the actual GET), which is expected behavior — Bridge does not track file existence.

## Usage

Delete a specific document (owner access):

```http
POST /call
Authorization: Bearer <jwt-for-user-abc>
Content-Type: application/json

{
  "path": "storage/main/delete",
  "params": {
    "key": "docs/abc/report.pdf"
  }
}
```

Response:

```json
{
  "data": {}
}
```

Attempt by a different user (user-xyz) to delete user-abc's document:

```http
POST /call
Authorization: Bearer <jwt-for-user-xyz>
Content-Type: application/json

{
  "path": "storage/main/delete",
  "params": {
    "key": "docs/abc/report.pdf"
  }
}
```

Response: HTTP 403 (CEL condition `path.userId == request.auth.sub` evaluates to false: `"abc" != "xyz"`).

## Acceptance Criteria

- [ ] Authenticated request satisfying the policy `delete` rule returns HTTP 200 with `{ "data": {} }`.
- [ ] Request against a key whose policy has no `delete` rule returns HTTP 403.
- [ ] Request against a key that matches no policy at all returns HTTP 403.
- [ ] Authenticated request where the CEL condition evaluates to false (e.g., requesting another user's path) returns HTTP 403.
- [ ] Request with no credential against an `authenticated`-role `delete` rule returns HTTP 401.
- [ ] Key containing `..` or other invalid characters returns HTTP 400.

## Failure Modes

- Key contains `..`, `//`, control characters, or leading slash: HTTP 400.
- No credential on request against an `authenticated`-role delete rule: HTTP 401.
- Caller role not in the `delete` rule's `roles` list: HTTP 403.
- CEL condition evaluates to false: HTTP 403.
- Policy matches but no `delete` rule is declared (default deny): HTTP 403.
- No policy matches the requested key: HTTP 403.
