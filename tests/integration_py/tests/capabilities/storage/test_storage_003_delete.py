import pytest

from dsl import (
    api_key_headers,
    bootstrap_project,
    create_api_key,
    jwt_headers,
    signup_and_login,
)

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/storage_delete"

pytestmark = [pytest.mark.domain("storage"), pytest.mark.capability("STORAGE-003")]


def _token_sub(env, token: str) -> str:
    verify = env.httpToHub("POST", "/internal/tokens/verify", json={"token": token})
    assert verify.status_code == 200
    return verify.json()["claims"]["sub"]


def test_storage_delete(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")
    project = bootstrap_project(env, FIXTURE_DIR, "storage_delete", "storage-delete-1")

    owner_token = signup_and_login(env, project, "owner@example.com", "pw123")
    other_token = signup_and_login(env, project, "other@example.com", "pw123")
    owner_sub = _token_sub(env, owner_token)

    ok = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/delete",
            "params": {"key": f"docs/{owner_sub}/report.pdf"},
        },
        headers=jwt_headers(owner_token, project),
    )
    assert ok.status_code == 200
    assert ok.json()["data"] == {}

    no_rule = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "storage/main/delete", "params": {"key": "avatars/123.jpg"}},
        headers=jwt_headers(owner_token, project),
    )
    assert no_rule.status_code == 403

    no_policy = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "storage/main/delete", "params": {"key": "secret/top.pdf"}},
        headers=jwt_headers(owner_token, project),
    )
    assert no_policy.status_code == 403

    cond_false = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/delete",
            "params": {"key": f"docs/{owner_sub}/report.pdf"},
        },
        headers=jwt_headers(other_token, project),
    )
    assert cond_false.status_code == 403

    no_credential = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/delete",
            "params": {"key": f"docs/{owner_sub}/report.pdf"},
        },
        headers={"X-Santokit-Project": project, "X-Santokit-Env": "dev"},
    )
    assert no_credential.status_code == 401

    role_mismatch_key = create_api_key(
        env, project, FIXTURE_DIR, name="server-key", roles="server"
    )
    role_mismatch = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/delete",
            "params": {"key": f"docs/{owner_sub}/report.pdf"},
        },
        headers=api_key_headers(role_mismatch_key, project),
    )
    assert role_mismatch.status_code == 403

    for bad_key in ["../docs/a/x.pdf", "/docs/a/x.pdf", "docs//a/x.pdf"]:
        bad = env.httpToBridge(
            "POST",
            "/call",
            json={"path": "storage/main/delete", "params": {"key": bad_key}},
            headers=jwt_headers(owner_token, project),
        )
        assert bad.status_code == 400
