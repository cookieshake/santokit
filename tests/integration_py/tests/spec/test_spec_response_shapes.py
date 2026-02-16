import pytest

from dsl import api_key_headers, bootstrap_project, create_api_key, get_rows

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/logics_call"

pytestmark = [pytest.mark.spec("response_shape")]


def test_spec_row_and_affected_response_shapes(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "specshape", "spec-shape-1")
    api_key = create_api_key(env, project, FIXTURE_DIR)
    headers = api_key_headers(api_key, project)

    row_resp = env.httpToBridge(
        "POST", "/call", json={"path": "logics/public_hello"}, headers={}
    )
    assert row_resp.status_code == 200
    rows = get_rows(row_resp.json())
    assert isinstance(rows, list)

    affected_resp = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "logics/insert_item",
            "params": {"name": "Spec Item", "owner_id": "spec-owner"},
        },
        headers=headers,
    )
    assert affected_resp.status_code == 200
    body = affected_resp.json()
    assert "data" in body
    assert isinstance(body["data"], dict)
    assert "affected" in body["data"]
