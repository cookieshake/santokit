---
id: OPERATOR-002
domain: operator
title: Create and use project API key
status: implemented
depends: [OPERATOR-001]
spec_refs: ["plan/spec/cli.md"]
test_refs:
  - tests/integration_py/tests/capabilities/operator/test_operator_002_apikey.py::test_operator_apikey
code_refs:
  - tests/integration_py/tests/capabilities/operator/test_operator_002_apikey.py
---

## Intent
Operators need service credentials for non-human callers (servers, CI pipelines) that can be issued, listed, and revoked without downtime; this capability manages the full API key lifecycle against Bridge-authenticated data-plane access.

## Execution Semantics
- `stk apikey create` creates a key record bound to project/env and a role set. The plaintext key is printed exactly once at creation time; Hub stores only the hashed key entity afterward and cannot re-emit the plaintext.
- `stk apikey list` queries key metadata (`status`, role bindings, usage timestamps). It never returns the plaintext key value.
- `stk apikey revoke` marks the key record as revoked; Bridge rejects any subsequent request carrying that key with HTTP 401.
- Bridge extracts the key from the `X-Santokit-Api-Key` request header. The key's project/env binding is authoritative: Bridge uses it to select the correct release and enforce authorization.

## Observable Outcome
- Service can authenticate to Bridge using `X-Santokit-Api-Key` while key is active.
- Revoked key can no longer authorize requests.

## Usage
- `stk apikey create --project <project> --env <env> --name <name> --roles <role1,role2>`
- `stk apikey list --project <project> --env <env>`
- `stk apikey revoke --project <project> --env <env> --key-id <keyId>`

Example `/call` request using the issued key:
```
POST /call
X-Santokit-Api-Key: sk_live_abc123...
Content-Type: application/json
```

## Acceptance Criteria
- [ ] `stk apikey create` exits 0 and prints the plaintext key exactly once.
- [ ] `stk apikey list` exits 0 and includes the newly created key with `status: active`.
- [ ] A `/call` request using the active key in `X-Santokit-Api-Key` returns HTTP 200.
- [ ] `stk apikey revoke` exits 0 and the key status becomes `revoked`.
- [ ] A `/call` request using the revoked key returns HTTP 401.

## Failure Modes
- Insufficient operator privileges (caller lacks `project:admin`): create/list/revoke exits non-zero; Hub returns HTTP 403.
- Invalid role bindings (role not valid for the project scope): key creation is rejected with exit code non-zero and HTTP 422.
