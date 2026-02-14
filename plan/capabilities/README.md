# Capability Documents (SoT)

`plan/capabilities/` is the single source of truth for implementation and test tracking.

## ID and File Naming

- Domain is fixed to one of: `operator`, `auth`, `crud`, `security`, `logics`.
- Capability ID format: `DOMAIN-NNN` (example: `AUTH-003`).
- File format: `{ID}-{slug}.md` (example: `AUTH-003-multi-project-login.md`).

## Frontmatter Schema

Each file must include this metadata:

- `id`: capability identifier (`AUTH-003`)
- `domain`: one of fixed domains
- `title`: short capability title
- `status`: `planned | in_progress | implemented`
- `owners`: code ownership tags
- `flow_refs`: one or more narrative references (use `plan/capabilities/<domain>/README.md`)
- `spec_refs`: one or more spec references
- `test_refs`: pytest node IDs (required when implemented)
- `code_refs`: code paths implementing the behavior
- `verify`: command list to validate behavior

## Content Rules

- Capability document contains normative behavior for that capability.
- Capability document includes at least one executable usage example:
  - operator domain: `stk ...` commands
  - other domains: `/call` request or API request example
- Capability document explains execution semantics, not only command lists:
  - caller intent (what outcome the operator wants)
  - command behavior (what control-plane/data-plane state changes)
  - observable result and key failure modes
- Domain capability guides (`plan/capabilities/<domain>/README.md`) contain narrative steps and capability links.
- Spec docs contain shared definitions and common rules reused by multiple capabilities.

## Status Rules

- `implemented` requires at least one `test_refs` entry and one `verify` entry.
- `planned` can have empty `test_refs` and `verify`.

## Validation Command

- `python3 scripts/validate-capabilities.py`
