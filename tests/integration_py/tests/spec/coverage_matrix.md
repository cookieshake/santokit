# Capability Coverage Matrix

Last run: `./scripts/run-integration-tests.sh --from-plan --status implemented` on 2026-02-16

Legend:
- `pass`: capability test passed in latest run
- `fail`: capability test failed in latest run

| Capability | Node ID | Status | Acceptance Coverage Notes |
|---|---|---|---|
| OPERATOR-001 | `tests/integration_py/tests/capabilities/operator/test_operator_001_bootstrap.py::test_operator_bootstrap` | pass | project/env create, connection set/test, apply success |
| OPERATOR-002 | `tests/integration_py/tests/capabilities/operator/test_operator_002_apikey.py::test_operator_apikey` | fail | create/list/use/revoke covered; revoke enforcement currently failing |
| OPERATOR-003 | `tests/integration_py/tests/capabilities/operator/test_operator_003_apply_schema.py::test_operator_schema_change` | pass | schema re-apply path covered |
| OPERATOR-004 | `tests/integration_py/tests/capabilities/operator/test_operator_004_apply_permissions.py::test_operator_permissions_change` | pass | permissions re-apply path covered |
| OPERATOR-005 | `tests/integration_py/tests/capabilities/operator/test_operator_005_release_promote_rollback.py::test_operator_release_promotion_rollback` | pass | promote + rollback pointer flow covered |
| AUTH-001 | `tests/integration_py/tests/capabilities/auth/test_auth_001_hub_issuer_login.py::test_enduser_login_hub_issuer` | fail | signup/login + bridge success + context mismatch rejection covered |
| AUTH-002 | `tests/integration_py/tests/capabilities/auth/test_auth_002_oidc_provider_config.py::test_enduser_login_external_oidc` | fail | provider create/duplicate/malformed issuer covered |
| AUTH-003 | `tests/integration_py/tests/capabilities/auth/test_auth_003_multi_project_login.py::test_enduser_multi_project_login` | fail | multi-project token isolation covered |
| CRUD-001 | `tests/integration_py/tests/capabilities/crud/test_crud_001_basic.py::test_crud_basic` | fail | insert/select/id policy/rejection covered |
| CRUD-002 | `tests/integration_py/tests/capabilities/crud/test_crud_002_advanced.py::test_crud_advanced` | fail | update/delete + where safety gate covered |
| CRUD-003 | `tests/integration_py/tests/capabilities/crud/test_crud_003_expand.py::test_crud_expand` | fail | expand success/no-expand/invalid expand covered |
| CRUD-004 | `tests/integration_py/tests/capabilities/crud/test_crud_004_pagination_sorting.py::test_crud_pagination_sorting` | pass | limit/offset/sort/invalid input covered |
| CRUD-005 | `tests/integration_py/tests/capabilities/crud/test_crud_005_array_validation.py::test_crud_array_validation` | fail | valid/mixed/non-array validation covered |
| SECURITY-001 | `tests/integration_py/tests/capabilities/security/test_security_001_cel_condition.py::test_cel_condition` | pass | owner filter + cross-user deny + unauth deny covered |
| SECURITY-002 | `tests/integration_py/tests/capabilities/security/test_security_002_cel_literal.py::test_cel_resource_literal_condition` | fail | literal allow/deny behavior covered |
| SECURITY-003 | `tests/integration_py/tests/capabilities/security/test_security_003_cel_unsupported.py::test_cel_resource_unsupported_operator` | fail | unsupported CEL operator hard-fail covered |
| SECURITY-004 | `tests/integration_py/tests/capabilities/security/test_security_004_column_prefix.py::test_column_prefix` | pass | explicit column visibility, prefix not implicit covered |
| SECURITY-005 | `tests/integration_py/tests/capabilities/security/test_security_005_column_permissions.py::test_column_permissions` | fail | select projection + disallowed write rejection covered |
| LOGICS-001 | `tests/integration_py/tests/capabilities/logics/test_logics_001_whoami.py::test_logics_whoami` | pass | authenticated subject binding covered |
| LOGICS-002 | `tests/integration_py/tests/capabilities/logics/test_logics_002_public_hello.py::test_logics_public_hello` | fail | public logic unauth success covered |
| LOGICS-003 | `tests/integration_py/tests/capabilities/logics/test_logics_003_exec_affected.py::test_logics_insert_item` | fail | execute-only affected response + persistence check covered |
| LOGICS-004 | `tests/integration_py/tests/capabilities/logics/test_logics_004_param_required.py::test_logics_get_items` | pass | required param presence/type validation covered |
| LOGICS-005 | `tests/integration_py/tests/capabilities/logics/test_logics_005_param_defaults.py::test_logics_default_params` | fail | optional default + override + wrong-type validation covered |
| LOGICS-006 | `tests/integration_py/tests/capabilities/logics/test_logics_006_role_guard.py::test_logics_admin_only` | pass | 401/403/200 role guard split covered |
| LOGICS-007 | `tests/integration_py/tests/capabilities/logics/test_logics_007_errors.py::test_logics_error_cases` | pass | 400/401/403/404 + structured error body covered |

## Cross-spec coverage

| Spec Test | Purpose |
|---|---|
| `tests/integration_py/tests/spec/test_spec_error_envelope.py::test_spec_error_envelope_has_required_fields` | stable error envelope contract |
| `tests/integration_py/tests/spec/test_spec_response_shapes.py::test_spec_row_and_affected_response_shapes` | row vs affected response shape split |
| `tests/integration_py/tests/spec/test_spec_status_codes.py::test_spec_status_code_contract_for_common_failures` | shared status-code semantics |
| `tests/integration_py/tests/spec/test_spec_where_safety_gate.py::test_spec_update_delete_require_non_empty_where` | update/delete safety gate |

## Current blockers from latest run

- Auth pipeline behavior mismatch (`AUTH-001`, `AUTH-003`) currently returns `403` where plan expects success.
- OIDC provider endpoint behavior mismatch (`AUTH-002`) currently returns `200` on create/duplicate where plan expects `201` and `409`.
- CRUD insert response contract mismatch (`CRUD-001/002/003/005`) currently returns legacy `{ generated_id, ids }` shape.
- Public/default logic auth mismatch (`LOGICS-002`, `LOGICS-005`) currently returns `401` for unauth calls.
- Execute-only logic runtime mismatch (`LOGICS-003`) currently returns `500`.
- API key revoke enforcement mismatch (`OPERATOR-002`) currently still accepts revoked key.
- CEL literal/unsupported handling mismatch (`SECURITY-002`, `SECURITY-003`) currently diverges from planned behavior/message.
- Column write rejection status mismatch (`SECURITY-005`) currently `403` where plan expects `400` for disallowed columns.
