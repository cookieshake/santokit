---
id: STORAGE-001
domain: storage
title: Upload sign — presigned URL for file upload
status: planned
depends: [OPERATOR-001]
spec_refs: ["plan/spec/storage.md", "plan/spec/security.md"]
test_refs: []
code_refs: []
---

## Intent

Enables authenticated callers to obtain a short-lived presigned PUT URL for uploading a file directly to S3-compatible storage, without routing the file stream through Bridge. Bridge acts as the access control gatekeeper and URL signer only.

## Execution Semantics

Bridge processes an `upload_sign` request as follows:

1. **Key validation** — The `key` parameter is normalized to a canonical path. Keys containing `..`, double slashes (`//`), control characters, or a leading slash are rejected with HTTP 400 before any policy lookup.
2. **Policy matching** — The normalized key is matched against glob patterns defined in `config/storage.yaml`. The first matching policy entry is used. If no policy matches, the request is denied with HTTP 403.
3. **Role check** — The caller's roles are checked against the policy's `roles` list (OR logic). If no role matches, the request is denied with HTTP 403.
4. **CEL condition evaluation** — If the policy defines a `condition`, Bridge evaluates the CEL expression with the request context (`request.auth.sub`, `request.auth.roles`, `path.{variable}` bindings, `request.params.key`, `request.params.contentLength`). A non-`true` result is denied with HTTP 403.
5. **File constraint validation** — If the policy defines `maxSize`, `contentLength` must be provided and must not exceed the limit; otherwise HTTP 400. If `allowedTypes` is defined, `contentType` must be provided and must appear in the list; otherwise HTTP 400.
6. **Presigned URL generation** — Bridge calls the S3 SDK to generate a presigned PUT URL with a TTL of 5 minutes (default; max 15 minutes) and returns it in the response envelope.

The `avatars/*` policy example from `config/storage.yaml`:

```yaml
policies:
  "avatars/*":
    upload_sign:
      roles: [authenticated]
      condition: "true"
      maxSize: 5MB
      allowedTypes: ["image/jpeg", "image/png"]
```

## Observable Outcome

A caller with a valid authenticated credential and a key matching a permissive policy receives HTTP 200 with a presigned PUT URL:

```json
{
  "data": {
    "url": "https://s3.ap-northeast-2.amazonaws.com/my-app-assets-prod/avatars/123.jpg?X-Amz-Signature=...",
    "method": "PUT",
    "headers": { "Content-Type": "image/jpeg" }
  }
}
```

The caller then performs `PUT <url>` directly against S3 with the file body. Bridge is not involved in the actual file transfer.

## Usage

Request a presigned upload URL for `avatars/123.jpg`:

```http
POST /call
Authorization: Bearer <jwt-for-authenticated-user>
Content-Type: application/json

{
  "path": "storage/main/upload_sign",
  "params": {
    "key": "avatars/123.jpg",
    "contentType": "image/jpeg",
    "contentLength": 204800
  }
}
```

Response:

```json
{
  "data": {
    "url": "https://s3.ap-northeast-2.amazonaws.com/my-app-assets-prod/avatars/123.jpg?X-Amz-Signature=...",
    "method": "PUT",
    "headers": { "Content-Type": "image/jpeg" }
  }
}
```

The client then uploads the file:

```http
PUT <url>
Content-Type: image/jpeg

<file body>
```

## Acceptance Criteria

- [ ] Valid authenticated request with a key matching an `upload_sign` policy returns HTTP 200 with `data.url`, `data.method`, and `data.headers`.
- [ ] `data.method` is `"PUT"` for `upload_sign`.
- [ ] Key containing `..` returns HTTP 400 before any policy lookup.
- [ ] Key containing a leading slash or double slash returns HTTP 400.
- [ ] `contentLength` exceeding the policy `maxSize` returns HTTP 400.
- [ ] `contentType` not in the policy `allowedTypes` list returns HTTP 400.
- [ ] Policy defines `maxSize` but `contentLength` is omitted: returns HTTP 400.
- [ ] Policy defines `allowedTypes` but `contentType` is omitted: returns HTTP 400.
- [ ] Request with no credential against an `authenticated`-role policy returns HTTP 401.
- [ ] Request with a credential whose role does not match the policy `roles` list returns HTTP 403.
- [ ] CEL `condition` evaluates to `false` returns HTTP 403.
- [ ] Key that matches no policy entry returns HTTP 403.

## Failure Modes

- Key contains `..`, `//`, control characters, or leading slash: HTTP 400, rejected before policy lookup.
- `contentLength` exceeds `maxSize`: HTTP 400, presigned URL not issued.
- `contentType` not in `allowedTypes`: HTTP 400, presigned URL not issued.
- `contentLength` absent when `maxSize` policy is defined: HTTP 400.
- `contentType` absent when `allowedTypes` policy is defined: HTTP 400.
- No credential on request (unauthenticated) against authenticated-only policy: HTTP 401.
- Caller role not in policy `roles` list: HTTP 403.
- CEL condition evaluates to false: HTTP 403.
- No policy matches the requested key: HTTP 403.
