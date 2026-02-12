# Decision Log

This document records resolved design decisions for the Santokit project.

---

## 2026-02-12: End User Account Linking (Explicit Only)

Context
- Multiple OIDC providers + built-in email/password are supported.
- v0 does not implement email verification.

Decision
- v0 does **not** support automatic linking/merge (e.g., “same email” auto-attach).
- Linking is **explicit** and requires an authenticated End User session (cookie or bearer).
- Conflicts are rejected: if an identity is already linked to a different End User, return `409 CONFLICT`.

Rationale
- Without email verification, auto-linking by email is unsafe (account takeover risk).
- Explicit linking keeps the security model simple and auditable.

References
- `plan/spec/auth.md`

---

## 2026-02-10: Bridge-Hub Internal Keys Logging Exclusion

Context
- `GET /internal/keys/{project}/{env}` returns token verification key material.

Decision
- Do not log/trace request/response bodies for `/internal/keys/*`.
- Redact key material from all error messages.

Rationale
- Defense-in-depth: key material must never reach log aggregation systems.

References
- `plan/spec/bridge-hub-protocol.md` Section 1.1.1
