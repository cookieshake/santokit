---
id: STORAGE-004
domain: storage
title: Multipart upload flow
status: planned
depends: [STORAGE-001]
spec_refs: ["plan/spec/storage.md"]
test_refs: []
code_refs: []
---

## Intent

Enables callers to upload large files to S3-compatible storage by splitting the transfer into individually signed parts. Bridge coordinates the multipart upload lifecycle (create, sign parts, complete, abort) while the client streams each part directly to S3.

## Execution Semantics

The multipart upload flow consists of four operations, all following the same policy matching and permission model as `upload_sign` (STORAGE-001):

### `multipart_create`

1. Policy matching, role check, and CEL condition evaluation against the `upload_sign` policy for the given key.
2. File constraint validation: `maxSize` and `allowedTypes` are checked. If `maxSize` is defined, `contentLength` (total size) is required.
3. Bridge calls S3 `CreateMultipartUpload` and returns the `uploadId`.

**Response:** `{ "data": { "uploadId": "<s3-upload-id>" } }`

### `multipart_sign_part`

1. Policy matching and permission check (same `upload_sign` policy).
2. Bridge calls the S3 SDK to generate a presigned PUT URL scoped to the specific `uploadId` and `partNumber`.

**Response:** `{ "data": { "url": "<presigned-put-url>", "method": "PUT" } }`

### `multipart_complete`

1. Policy matching and permission check.
2. Bridge calls S3 `CompleteMultipartUpload` with the provided `parts` array (each part identified by `partNumber` and `etag` as returned by S3 after the part upload).
3. S3 assembles the parts into the final object.

**Response:** `{ "data": {} }`

### `multipart_abort`

1. Policy matching and permission check.
2. Bridge calls S3 `AbortMultipartUpload`. Incomplete part data is discarded by S3.

**Response:** `{ "data": {} }`

## Observable Outcome

After a complete multipart flow (create → sign each part → complete), the assembled file exists in S3 at the specified key, identical to a single-part upload. After abort, the in-progress upload and all uploaded parts are discarded.

## Usage

**Step 1 — Create the multipart upload:**

```http
POST /call
Authorization: Bearer <jwt-for-authenticated-user>
Content-Type: application/json

{
  "path": "storage/main/multipart_create",
  "params": {
    "key": "avatars/large-video.mp4",
    "contentType": "video/mp4",
    "contentLength": 104857600
  }
}
```

Response:

```json
{ "data": { "uploadId": "VXBsb2FkIElEIGZvciA2aWWpbmcncyBteS1tb3ZpZS5t" } }
```

**Step 2 — Sign each part (repeat for each 5 MB+ chunk):**

```http
POST /call
Authorization: Bearer <jwt-for-authenticated-user>
Content-Type: application/json

{
  "path": "storage/main/multipart_sign_part",
  "params": {
    "key": "avatars/large-video.mp4",
    "uploadId": "VXBsb2FkIElEIGZvciA2aWWpbmcncyBteS1tb3ZpZS5t",
    "partNumber": 1,
    "contentLength": 5242880
  }
}
```

Response:

```json
{ "data": { "url": "https://s3.ap-northeast-2.amazonaws.com/...?partNumber=1&uploadId=...&X-Amz-Signature=...", "method": "PUT" } }
```

Client uploads the part: `PUT <url>` — S3 returns an `ETag` header.

**Step 3 — Complete the upload:**

```http
POST /call
Authorization: Bearer <jwt-for-authenticated-user>
Content-Type: application/json

{
  "path": "storage/main/multipart_complete",
  "params": {
    "key": "avatars/large-video.mp4",
    "uploadId": "VXBsb2FkIElEIGZvciA2aWWpbmcncyBteS1tb3ZpZS5t",
    "parts": [
      { "partNumber": 1, "etag": "\"d8e8fca2dc0f896fd7cb4cb0031ba249\"" },
      { "partNumber": 2, "etag": "\"d8e8fca2dc0f896fd7cb4cb0031ba250\"" }
    ]
  }
}
```

Response:

```json
{ "data": {} }
```

**Abort (on error or cancellation):**

```http
POST /call
Authorization: Bearer <jwt-for-authenticated-user>
Content-Type: application/json

{
  "path": "storage/main/multipart_abort",
  "params": {
    "key": "avatars/large-video.mp4",
    "uploadId": "VXBsb2FkIElEIGZvciA2aWWpbmcncyBteS1tb3ZpZS5t"
  }
}
```

## Acceptance Criteria

- [ ] `multipart_create` with valid params returns HTTP 200 with `data.uploadId` as a non-empty string.
- [ ] `multipart_sign_part` with a valid `uploadId` and `partNumber` returns HTTP 200 with `data.url` and `data.method = "PUT"`.
- [ ] `multipart_complete` with all parts and their ETags returns HTTP 200 and the file is accessible in S3.
- [ ] `multipart_abort` with a valid `uploadId` returns HTTP 200 and the in-progress upload is discarded.
- [ ] `multipart_create` with `contentLength` exceeding the policy `maxSize` returns HTTP 400.
- [ ] `multipart_create` with `contentType` not in `allowedTypes` returns HTTP 400.
- [ ] Any multipart operation without a credential against an authenticated policy returns HTTP 401.
- [ ] Any multipart operation failing the CEL condition or role check returns HTTP 403.

## Failure Modes

- `contentLength` exceeds `maxSize` on `multipart_create`: HTTP 400.
- `contentType` not in `allowedTypes` on `multipart_create`: HTTP 400.
- Key contains invalid characters (`..`, `//`, leading slash): HTTP 400.
- No credential on request against authenticated policy: HTTP 401.
- Caller role not in policy `roles` list: HTTP 403.
- CEL condition evaluates to false: HTTP 403.
- No policy matches the requested key: HTTP 403.
- Providing an invalid or already-completed `uploadId` to `multipart_sign_part` or `multipart_complete`: S3 returns an error; Bridge propagates as HTTP 400.
