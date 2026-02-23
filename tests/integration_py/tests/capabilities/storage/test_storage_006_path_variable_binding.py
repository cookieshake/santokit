import pytest

from dsl import (
    api_key_headers,
    bootstrap_project,
    create_api_key,
    jwt_headers,
    signup_and_login,
)

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/storage_path_binding"

pytestmark = [pytest.mark.domain("storage"), pytest.mark.capability("STORAGE-006")]


def _sub_for_token(env, token: str) -> str:
    verify = env.httpToHub("POST", "/internal/tokens/verify", json={"token": token})
    assert verify.status_code == 200
    return verify.json()["claims"]["sub"]


def test_storage_path_variable_binding(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")
    project = bootstrap_project(env, FIXTURE_DIR, "storage_path", "storage-path-1")

    token_owner = signup_and_login(env, project, "owner@example.com", "pw123")
    token_other = signup_and_login(env, project, "other@example.com", "pw123")
    owner_sub = _sub_for_token(env, token_owner)

    owner_ok = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/upload_sign",
            "params": {
                "key": f"docs/{owner_sub}/report.pdf",
                "contentType": "application/pdf",
                "contentLength": 1000,
            },
        },
        headers=jwt_headers(token_owner, project),
    )
    assert owner_ok.status_code == 200

    non_owner = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/upload_sign",
            "params": {
                "key": f"docs/{owner_sub}/report.pdf",
                "contentType": "application/pdf",
                "contentLength": 1000,
            },
        },
        headers=jwt_headers(token_other, project),
    )
    assert non_owner.status_code == 403

    admin_key = create_api_key(
        env, project, FIXTURE_DIR, name="storage-admin", roles="admin"
    )
    admin_ok = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/upload_sign",
            "params": {
                "key": f"org/acme/user/{owner_sub}/report.pdf",
                "contentType": "application/pdf",
                "contentLength": 1000,
            },
        },
        headers=api_key_headers(admin_key, project),
    )
    assert admin_ok.status_code == 200

    unauth = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/upload_sign",
            "params": {
                "key": f"docs/{owner_sub}/report.pdf",
                "contentType": "application/pdf",
                "contentLength": 1000,
            },
        },
        headers={"X-Santokit-Project": project, "X-Santokit-Env": "dev"},
    )
    assert unauth.status_code == 401

    undefined_path_var = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/upload_sign",
            "params": {
                "key": f"typo/{owner_sub}/report.pdf",
                "contentType": "application/pdf",
                "contentLength": 1000,
            },
        },
        headers=jwt_headers(token_owner, project),
    )
    assert undefined_path_var.status_code == 400
