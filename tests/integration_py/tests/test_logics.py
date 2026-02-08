import re
from dsl import unique_project, bootstrap_project, create_api_key, api_key_headers

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/logics_call"


def test_logics_call(compose_env):
    """Flow 15: Custom SQL logic execution"""
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "logics", "logics-1")
    api_key = create_api_key(env, project, FIXTURE_DIR)
    headers = api_key_headers(api_key, project)

    insert_resp = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/insert", "params": {"values": {"email": "logic@test.com", "name": "Logic User"}}},
        headers=headers,
    )
    assert insert_resp.status_code == 200

    logic_resp = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "logics/get_user_count"},
        headers=headers,
    )
    assert logic_resp.status_code == 200
    data = logic_resp.json().get("data", {})
    if isinstance(data, dict):
        rows = data.get("data", [])
    else:
        rows = data
    assert len(rows) >= 1
