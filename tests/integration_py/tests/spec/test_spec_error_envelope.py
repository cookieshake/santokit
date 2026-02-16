import pytest

from dsl import api_key_headers, bootstrap_project, create_api_key

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/logics_call"

pytestmark = [pytest.mark.spec("errors")]


def test_spec_error_envelope_has_required_fields(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "specerr", "spec-err-1")
    api_key = create_api_key(env, project, FIXTURE_DIR)
    headers = api_key_headers(api_key, project)

    resp = env.httpToBridge(
        "POST", "/call", json={"path": "logics/nonexistent"}, headers=headers
    )
    assert resp.status_code == 404
    body = resp.json()
    assert "error" in body
    assert "code" in body["error"]
    assert "message" in body["error"]
    assert "requestId" in body["error"]
