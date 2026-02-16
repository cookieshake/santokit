---
id: LOGICS-007
domain: logics
title: Return consistent errors for common logic failure modes
status: implemented
depends: [LOGICS-001]
spec_refs: ["plan/spec/errors.md"]
test_refs:
  - tests/integration_py/tests/capabilities/logics/test_logics_007_errors.py::test_logics_error_cases
code_refs:
  - tests/integration_py/tests/capabilities/logics/test_logics_007_errors.py
---

## Intent
Clients need stable, diagnosable HTTP error responses for common logic invocation mistakes so that missing params, unknown routes, auth failures, and type mismatches are all distinguishable without DB round-trips.

## Execution Semantics
Validation and routing errors are classified before DB execution. Bridge processes each request through an ordered pipeline: route resolution, auth check, param validation, then SQL execution. The first failing stage produces the response; later stages are not evaluated.

Error responses always use a structured body:

```json
{ "error": { "code": "BAD_REQUEST", "message": "...", "requestId": "..." } }
```

The `code` field uses a stable string enum (`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`) so clients can switch on it without parsing the `message` string.

## Observable Outcome
- Same invalid input yields the same error category across repeated calls.
- Successful requests are never silently coerced from invalid payloads.
- Each failure mode maps to a distinct HTTP status code.

| Scenario | HTTP Status | `error.code` |
|---|---|---|
| Logic name not in snapshot | 404 | `NOT_FOUND` |
| No credential for authenticated logic | 401 | `UNAUTHORIZED` |
| Credential with wrong role | 403 | `FORBIDDEN` |
| Missing required param | 400 | `BAD_REQUEST` |
| Param type mismatch | 400 | `BAD_REQUEST` |

## Usage
Missing required param:

```http
POST /call
Content-Type: application/json
Authorization: Bearer <token>

{ "path": "logics/get_items" }
```

Logic not found:

```http
POST /call
Content-Type: application/json

{ "path": "logics/nonexistent" }
```

Wrong type for param:

```http
POST /call
Content-Type: application/json
Authorization: Bearer <token>

{ "path": "logics/get_items", "params": { "owner_id": 123 } }
```

## Acceptance Criteria
- [ ] `POST /call` with `{"path": "logics/get_items"}` (missing required `owner_id`) returns HTTP 400 with a structured error body containing `error.code`.
- [ ] `POST /call` with `{"path": "logics/nonexistent"}` returns HTTP 404 with a structured error body.
- [ ] `POST /call` with `{"path": "logics/admin_only"}` and no credential returns HTTP 401 with a structured error body.
- [ ] `POST /call` with `{"path": "logics/admin_only"}` using an end-user credential without the required role returns HTTP 403 with a structured error body.
- [ ] `POST /call` with `{"path": "logics/get_items", "params": {"owner_id": 123}}` (integer instead of string) returns HTTP 400 with a structured error body.
- [ ] All error responses use a structured body `{"error": {"code": "...", "message": "...", "requestId": "..."}}` suitable for client-side parsing.

## Failure Modes
- Ambiguous or combined invalid inputs follow pipeline order: HTTP 404 if logic is unknown, then HTTP 401/403 if auth fails, then HTTP 400 if params are invalid.
- First failing stage wins; subsequent stage errors are not reported in the same response.
