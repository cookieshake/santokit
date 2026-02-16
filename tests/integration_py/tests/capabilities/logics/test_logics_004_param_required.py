import pytest

from dsl import api_key_headers, bootstrap_project, create_api_key, get_rows

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/logics_call"

pytestmark = [pytest.mark.domain("logics"), pytest.mark.capability("LOGICS-004")]


def test_logics_get_items(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "logics", "logics-b4")
    api_key = create_api_key(env, project, FIXTURE_DIR)
    headers = api_key_headers(api_key, project)

    resp = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/get_items", "params": {"owner_id": "nobody"}},
        headers=headers,
    )
    assert resp.status_code == 200
    assert len(get_rows(resp.json())) == 0

    missing = env.httpToBridge(
        "POST", "/call", json={"path": "logics/get_items"}, headers=headers
    )
    assert missing.status_code == 400

    wrong_type = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/get_items", "params": {"owner_id": 123}},
        headers=headers,
    )
    assert wrong_type.status_code == 400
