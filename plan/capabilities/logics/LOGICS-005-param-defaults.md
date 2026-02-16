---
id: LOGICS-005
domain: logics
title: Apply default values for optional logic parameters
status: implemented
depends: [LOGICS-001]
spec_refs: []
test_refs:
  - tests/integration_py/tests/capabilities/logics/test_logics_005_param_defaults.py::test_logics_default_params
code_refs:
  - tests/integration_py/tests/capabilities/logics/test_logics_005_param_defaults.py
---

## Intent
Callers need to invoke logic with fewer arguments while still getting deterministic behavior, so bridge fills in declared defaults for any omitted optional parameters before SQL binding.

## Execution Semantics
Bridge reads the param declarations from the logic metadata. For each param with `required: false` and a `default` value, bridge substitutes the declared default when the caller does not supply that param. Caller-provided values take precedence over defaults. After defaults are applied, the effective param set is type-checked before SQL binding.

The `default_params` logic is declared in the release snapshot as:

```yaml
name: default_params
sql: "SELECT :greeting AS greeting"
auth: public
params:
  greeting:
    type: string
    required: false
    default: "hello"
```

When called without params, bridge substitutes `greeting = "hello"` and executes the SQL. When called with `{"greeting": "hi"}`, bridge uses `"hi"` instead.

## Observable Outcome
When called without params, the response reflects the declared default value `"hello"`:

```json
{
  "data": [
    { "greeting": "hello" }
  ]
}
```

When called with an override, the response reflects the caller-supplied value:

```json
{
  "data": [
    { "greeting": "hi" }
  ]
}
```

The default value is always `"hello"` as declared in the logic definition; it is not inferred or dynamic.

## Usage
Logic definition (release snapshot):

```yaml
name: default_params
sql: "SELECT :greeting AS greeting"
auth: public
params:
  greeting:
    type: string
    required: false
    default: "hello"
```

Bridge call with no params (default applies):

```http
POST /call
Content-Type: application/json

{
  "path": "logics/default_params"
}
```

Bridge call with override:

```http
POST /call
Content-Type: application/json

{
  "path": "logics/default_params",
  "params": { "greeting": "hi" }
}
```

## Acceptance Criteria
- [ ] `POST /call` with `{"path": "logics/default_params"}` (no params) returns HTTP 200 with body `{"data": [{"greeting": "hello"}]}`.
- [ ] `POST /call` with `{"path": "logics/default_params", "params": {"greeting": "hi"}}` returns HTTP 200 with body `{"data": [{"greeting": "hi"}]}`.
- [ ] `POST /call` with `{"path": "logics/default_params", "params": {"greeting": 42}}` (wrong type: integer instead of string) returns HTTP 400.

## Failure Modes
- Provided override value has wrong type: HTTP 400 with structured error body.
- Logic name does not exist in release snapshot: HTTP 404.
