import pytest

from dsl import bootstrap_project, get_rows, jwt_headers, signup_and_login

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/storage_cascade_delete"

pytestmark = [pytest.mark.domain("storage"), pytest.mark.capability("STORAGE-005")]


def _insert_file_row(
    env, headers, name, avatar_key=None, backup_key=None, optional_key=None
):
    data = {"name": name}
    if avatar_key is not None:
        data["avatar_key"] = avatar_key
    if backup_key is not None:
        data["backup_key"] = backup_key
    if optional_key is not None:
        data["optional_key"] = optional_key
    resp = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/files/insert", "params": {"data": data}},
        headers=headers,
    )
    assert resp.status_code == 200
    return resp.json()["data"]["id"]


def test_storage_schema_cascade_delete(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")
    project = bootstrap_project(
        env, FIXTURE_DIR, "storage_cascade", "storage-cascade-1"
    )
    token = signup_and_login(env, project, "owner@example.com", "pw123")
    headers = jwt_headers(token, project)

    first_id = _insert_file_row(
        env,
        headers,
        name="first",
        avatar_key="avatars/a.jpg",
        backup_key="avatars/preserve.jpg",
    )
    delete_first = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/files/delete", "params": {"where": {"id": first_id}}},
        headers=headers,
    )
    assert delete_first.status_code == 200
    assert delete_first.json()["data"]["affected"] == 1

    second_id = _insert_file_row(env, headers, name="second")
    delete_second = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/files/delete", "params": {"where": {"id": second_id}}},
        headers=headers,
    )
    assert delete_second.status_code == 200
    assert delete_second.json()["data"]["affected"] == 1

    third_id = _insert_file_row(
        env, headers, name="third", avatar_key="secret/no-policy.jpg"
    )
    delete_third = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/files/delete", "params": {"where": {"id": third_id}}},
        headers=headers,
    )
    assert delete_third.status_code == 200
    assert delete_third.json()["data"]["affected"] == 1

    no_where = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/files/delete", "params": {}},
        headers=headers,
    )
    assert no_where.status_code == 400

    remaining = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/files/select", "params": {}},
        headers=headers,
    )
    assert remaining.status_code == 200
    assert len(get_rows(remaining.json())) == 0
