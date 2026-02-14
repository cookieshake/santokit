# Capability Documents (SoT)

`plan/capabilities/` is the single source of truth for implementation and test tracking.

## ID and File Naming

- Domain is fixed to one of: `operator`, `auth`, `crud`, `security`, `logics`, `storage`, `sdk`, `mcp`.
- Capability ID format: `DOMAIN-NNN` (example: `AUTH-003`).
- File format: `{ID}-{slug}.md` (example: `AUTH-003-multi-project-login.md`).

## Frontmatter Schema

Each file must include this metadata:

- `id`: capability identifier (`AUTH-003`)
- `domain`: one of fixed domains
- `title`: short capability title
- `status`: `planned | in_progress | implemented`
- `depends`: capability IDs this capability requires (example: `[OPERATOR-001, SECURITY-005]`). Empty if none.
- `spec_refs`: spec references if the capability relies on shared definitions (referenced files must exist). Empty if self-contained.
- `test_refs`: pytest node IDs (required when `implemented`)
- `code_refs`: code paths implementing the behavior (must be empty when `planned`)

## Content Sections

Each capability document must contain these sections in order:

1. `## Intent` — who needs this and why, in one or two sentences.
2. `## Execution Semantics` — what state changes occur, which components are involved.
3. `## Observable Outcome` — what the caller can verify after execution.
4. `## Usage` — at least one executable example:
   - operator domain: `stk ...` commands
   - other domains: `/call` request or API request example
5. `## Acceptance Criteria` — checklist of verifiable conditions:
   - Each item must specify concrete observables (HTTP status, response shape, data state).
   - Use `- [ ]` checklist format.
6. `## Failure Modes` — known error cases and their expected behavior.

## Content Rules

- Capability document contains normative behavior for that capability.
- Domain capability guides (`plan/capabilities/<domain>/README.md`) contain:
  - narrative flow explaining the order and relationship between capabilities
  - component boundaries involved (e.g., Hub vs Bridge, control-plane vs data-plane)
  - capability links
- Spec docs contain shared definitions and common rules reused by multiple capabilities.

## Status Rules

- `planned`: `test_refs` and `code_refs` must be empty.
- `in_progress`: `test_refs` may be partially filled. `code_refs` may be filled.
- `implemented`: requires at least one `test_refs` entry. `code_refs` must be filled.

## Validation Command

- `python3 scripts/validate-capabilities.py`
