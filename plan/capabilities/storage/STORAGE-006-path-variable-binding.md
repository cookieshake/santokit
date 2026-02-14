---
id: STORAGE-006
domain: storage
title: Path variable binding in storage CEL conditions
status: planned
depends: [STORAGE-001]
spec_refs: ["plan/spec/storage.md", "plan/spec/security.md"]
test_refs: []
code_refs: []
---

## Intent

Enables operators to write per-user storage isolation rules by embedding named variables in key glob patterns (e.g., `docs/{userId}/*`) and referencing them as `path.{variable}` in CEL conditions. This allows Bridge to enforce owner-based access control without requiring separate policy entries for each user.

## Execution Semantics

When Bridge matches a request key against a policy glob pattern containing `{variable}` segments:

1. **Pattern matching with variable extraction** — Bridge matches the normalized `key` against the glob pattern. Named `{variable}` segments capture the corresponding path segment. For example, the pattern `docs/{userId}/*` matched against `docs/abc/report.pdf` binds `path.userId = "abc"`.
2. **CEL context population** — Extracted path variables are added to the CEL evaluation context as `path.<variable>`. They are available alongside the standard context variables (`request.auth.sub`, `request.auth.roles`, `request.params.key`, `request.params.contentLength`).
3. **CEL condition evaluation** — The condition is evaluated with the populated context. For `condition: "path.userId == request.auth.sub"`, if the caller's JWT `sub` claim matches the extracted `userId` segment, the condition is true and the operation proceeds. Otherwise, HTTP 403 is returned.
4. **Admin bypass pattern** — A condition of the form `path.userId == request.auth.sub || 'admin' in request.auth.roles` allows both the file owner and users with the `admin` role to access any user's path.

Policy example:

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

## Observable Outcome

- User `abc` calling `upload_sign` for key `docs/abc/report.pdf`: `path.userId = "abc"`, `request.auth.sub = "abc"` → condition true → HTTP 200 with presigned URL.
- User `xyz` calling `upload_sign` for key `docs/abc/report.pdf`: `path.userId = "abc"`, `request.auth.sub = "xyz"` → condition false → HTTP 403.
- User `xyz` with role `admin` calling `download_sign` for key `docs/abc/report.pdf`: `'admin' in request.auth.roles = true` → condition true → HTTP 200.

## Usage

Policy configuration with path variable binding:

```yaml
# config/storage.yaml
policies:
  "docs/{userId}/*":
    upload_sign:
      roles: [authenticated]
      condition: "path.userId == request.auth.sub"
    download_sign:
      roles: [authenticated]
      condition: "path.userId == request.auth.sub || 'admin' in request.auth.roles"
```

Owner uploads to their own path:

```http
POST /call
Authorization: Bearer <jwt-with-sub=abc>
Content-Type: application/json

{
  "path": "storage/main/upload_sign",
  "params": {
    "key": "docs/abc/report.pdf",
    "contentType": "application/pdf"
  }
}
```

Response: HTTP 200 with presigned URL (`path.userId = "abc"` matches `request.auth.sub = "abc"`).

Unauthorized attempt by a different user:

```http
POST /call
Authorization: Bearer <jwt-with-sub=xyz>
Content-Type: application/json

{
  "path": "storage/main/upload_sign",
  "params": {
    "key": "docs/abc/report.pdf",
    "contentType": "application/pdf"
  }
}
```

Response: HTTP 403 (`path.userId = "abc"` does not match `request.auth.sub = "xyz"`).

Admin accessing any user's path:

```http
POST /call
Authorization: Bearer <jwt-with-sub=admin-user, roles=[admin]>
Content-Type: application/json

{
  "path": "storage/main/download_sign",
  "params": {
    "key": "docs/abc/report.pdf"
  }
}
```

Response: HTTP 200 (`'admin' in request.auth.roles = true`).

## Acceptance Criteria

- [ ] Key matching a pattern with `{variable}` extracts the variable value into the CEL context as `path.<variable>`.
- [ ] Owner (caller `sub` matches `path.userId`) successfully receives a presigned URL: HTTP 200.
- [ ] Non-owner (caller `sub` does not match `path.userId`) receives HTTP 403.
- [ ] Admin caller (role `admin` in `request.auth.roles`) can access any user's path when the condition includes the admin bypass: HTTP 200.
- [ ] A key with multiple path variable segments (e.g., `org/{orgId}/user/{userId}/*`) correctly extracts all variables into the CEL context.
- [ ] An unauthenticated request against a path-variable-gated policy returns HTTP 401.

## Failure Modes

- Caller `sub` does not match extracted path variable value and has no admin role: HTTP 403.
- No credential on request against an `authenticated`-role policy: HTTP 401.
- Caller role not in policy `roles` list: HTTP 403.
- Key does not match any policy pattern (no variable extraction occurs): HTTP 403.
- CEL condition references an undefined path variable (typo in condition or pattern mismatch): Bridge returns HTTP 400 (CEL evaluation error).
