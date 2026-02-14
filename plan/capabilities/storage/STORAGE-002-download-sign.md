---
id: STORAGE-002
domain: storage
title: Download sign — presigned URL for file download
status: planned
depends: [OPERATOR-001]
spec_refs: []
test_refs: []
code_refs: []
---

## Intent

Enables callers to obtain a short-lived presigned GET URL for accessing a private file in S3-compatible storage. Public policies require no credential; authenticated policies enforce role and CEL condition checks before issuing the URL.

## Execution Semantics

Bridge processes a `download_sign` request as follows:

1. **Key validation** — The `key` parameter is normalized to a canonical path. Keys containing `..`, double slashes (`//`), control characters, or a leading slash are rejected with HTTP 400.
2. **Policy matching** — The normalized key is matched against glob patterns in `config/storage.yaml`. If no policy matches, the request is denied with HTTP 403.
3. **Role check** — The policy's `roles` list is checked (OR logic). A `public` role means any caller — including unauthenticated requests — passes the role check. An `authenticated` role requires a valid credential.
4. **CEL condition evaluation** — If the matched policy defines a `condition`, Bridge evaluates the CEL expression. A non-`true` result is denied with HTTP 403. For `public` policies with no condition, this step is skipped.
5. **Presigned URL generation** — Bridge calls the S3 SDK to generate a presigned GET URL with a default TTL of 1 minute (maximum 5 minutes) and returns it in the response envelope.

The short TTL for `download_sign` (1 minute default, 5 minute maximum) is a deliberate security constraint to limit the window during which a leaked URL can be replayed.

Policy example from `config/storage.yaml`:

```yaml
policies:
  "avatars/*":
    download_sign:
      roles: [public]

  "docs/{userId}/*":
    download_sign:
      roles: [authenticated]
      condition: "path.userId == request.auth.sub || 'admin' in request.auth.roles"
```

## Observable Outcome

A caller whose credential satisfies the policy receives HTTP 200 with a presigned GET URL:

```json
{
  "data": {
    "url": "https://s3.ap-northeast-2.amazonaws.com/my-app-assets-prod/avatars/123.jpg?X-Amz-Signature=...",
    "method": "GET"
  }
}
```

The caller uses the URL directly (e.g., `<img src={url} />`). Bridge is not involved in the actual file transfer.

## Usage

Request a presigned download URL for a public avatar:

```http
POST /call
Content-Type: application/json

{
  "path": "storage/main/download_sign",
  "params": {
    "key": "avatars/123.jpg"
  }
}
```

Response:

```json
{
  "data": {
    "url": "https://s3.ap-northeast-2.amazonaws.com/my-app-assets-prod/avatars/123.jpg?X-Amz-Signature=...",
    "method": "GET"
  }
}
```

Request a presigned download URL for a private document (owner access):

```http
POST /call
Authorization: Bearer <jwt-for-user-abc>
Content-Type: application/json

{
  "path": "storage/main/download_sign",
  "params": {
    "key": "docs/abc/report.pdf"
  }
}
```

## Acceptance Criteria

- [ ] Valid request for a key under a `public` policy returns HTTP 200 with `data.url` and `data.method = "GET"` without any credential.
- [ ] Valid authenticated request for a key under an `authenticated` policy returns HTTP 200 with `data.url`.
- [ ] The presigned URL TTL does not exceed 5 minutes.
- [ ] Unauthenticated request against an `authenticated`-role policy returns HTTP 401.
- [ ] Caller role does not match policy `roles` list returns HTTP 403.
- [ ] CEL condition evaluates to `false` (e.g., requesting another user's document) returns HTTP 403.
- [ ] Key that matches no policy entry returns HTTP 403.
- [ ] Key containing `..` or other invalid characters returns HTTP 400.

## Failure Modes

- Key contains `..`, `//`, control characters, or leading slash: HTTP 400.
- No credential on request against an `authenticated`-role policy: HTTP 401.
- Caller role not in policy `roles` list: HTTP 403.
- CEL condition evaluates to false (e.g., `path.userId != request.auth.sub` and caller is not admin): HTTP 403.
- No policy matches the requested key: HTTP 403.
