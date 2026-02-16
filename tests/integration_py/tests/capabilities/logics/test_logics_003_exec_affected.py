import pytest

from dsl import api_key_headers, bootstrap_project, create_api_key, get_rows
from tests.helpers.assertions import assert_affected

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/logics_call"

pytestmark = [pytest.mark.domain("logics"), pytest.mark.capability("LOGICS-003")]


def test_logics_insert_item(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "logics", "logics-b3")
    api_key = create_api_key(env, project, FIXTURE_DIR)
    headers = api_key_headers(api_key, project)

    resp = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "logics/insert_item",
            "params": {"name": "Test Item", "owner_id": "owner-123"},
        },
        headers=headers,
    )
    assert resp.status_code == 200
    assert_affected(resp, expected=1)

    select_resp = env.httpToBridge(
        "POST", "/call", json={"path": "db/items/select"}, headers=headers
    )
    assert select_resp.status_code == 200
    rows = get_rows(select_resp.json())
    assert len(rows) == 1
    assert rows[0]["owner_id"] == "owner-123"
