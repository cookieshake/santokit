import pytest

from dsl import api_key_headers, bootstrap_project, create_api_key, get_rows

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/column_prefix"

pytestmark = [pytest.mark.domain("security"), pytest.mark.capability("SECURITY-004")]


def test_column_prefix(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "prefix", "prefix-1")
    admin_key = create_api_key(env, project, FIXTURE_DIR, name="admin", roles="admin")
    viewer_key = create_api_key(
        env, project, FIXTURE_DIR, name="viewer", roles="viewer"
    )

    admin_headers = api_key_headers(admin_key, project)
    viewer_headers = api_key_headers(viewer_key, project)

    insert_resp = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "db/users/insert",
            "params": {"values": {"normal": "John Doe", "s_sensitive": "s1"}},
        },
        headers=admin_headers,
    )
    assert insert_resp.status_code == 200

    select_viewer = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"where": {"normal": "John Doe"}}},
        headers=viewer_headers,
    )
    assert select_viewer.status_code == 200
    rows_viewer = get_rows(select_viewer.json())
    assert len(rows_viewer) == 1
    assert "normal" in rows_viewer[0]
    assert "s_sensitive" in rows_viewer[0]
    assert "c_secret" not in rows_viewer[0]
    assert "p_private" not in rows_viewer[0]
    assert "_system" not in rows_viewer[0]
