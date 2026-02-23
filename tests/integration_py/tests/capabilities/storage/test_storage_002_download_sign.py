from urllib.parse import parse_qs, urlparse

import pytest

from dsl import (
    api_key_headers,
    bootstrap_project,
    create_api_key,
    jwt_headers,
    signup_and_login,
)

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/storage_download_sign"

pytestmark = [pytest.mark.domain("storage"), pytest.mark.capability("STORAGE-002")]


def _token_sub(env, token: str) -> str:
    verify = env.httpToHub("POST", "/internal/tokens/verify", json={"token": token})
    assert verify.status_code == 200
    return verify.json()["claims"]["sub"]


def _expires(url: str) -> int:
    parsed = urlparse(url)
    return int(parse_qs(parsed.query).get("expires", ["0"])[0])


def test_storage_download_sign(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")
    project = bootstrap_project(env, FIXTURE_DIR, "storage_dl", "storage-dl-1")

    public_ok = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/download_sign",
            "params": {"key": "avatars/123.jpg"},
        },
        headers={"X-Santokit-Project": project, "X-Santokit-Env": "dev"},
    )
    assert public_ok.status_code == 200
    public_data = public_ok.json()["data"]
    assert public_data["method"] == "GET"
    assert public_data["url"].startswith("https://")
    assert _expires(public_data["url"]) <= 300

    token_owner = signup_and_login(env, project, "owner@example.com", "pw123")
    token_other = signup_and_login(env, project, "other@example.com", "pw123")
    owner_sub = _token_sub(env, token_owner)

    private_ok = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/download_sign",
            "params": {"key": f"docs/{owner_sub}/report.pdf"},
        },
        headers=jwt_headers(token_owner, project),
    )
    assert private_ok.status_code == 200
    private_data = private_ok.json()["data"]
    assert private_data["method"] == "GET"
    assert _expires(private_data["url"]) <= 300

    private_unauth = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/download_sign",
            "params": {"key": f"docs/{owner_sub}/report.pdf"},
        },
        headers={"X-Santokit-Project": project, "X-Santokit-Env": "dev"},
    )
    assert private_unauth.status_code == 401

    role_mismatch_key = create_api_key(
        env, project, FIXTURE_DIR, name="storage-reader", roles="server"
    )
    role_mismatch = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/download_sign",
            "params": {"key": f"docs/{owner_sub}/report.pdf"},
        },
        headers=api_key_headers(role_mismatch_key, project),
    )
    assert role_mismatch.status_code == 403

    condition_false = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/download_sign",
            "params": {"key": f"docs/{owner_sub}/report.pdf"},
        },
        headers=jwt_headers(token_other, project),
    )
    assert condition_false.status_code == 403

    no_policy = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/download_sign",
            "params": {"key": "secrets/top-secret.pdf"},
        },
        headers=jwt_headers(token_owner, project),
    )
    assert no_policy.status_code == 403

    for bad_key in ["../avatars/x.jpg", "/avatars/x.jpg", "avatars//x.jpg"]:
        bad = env.httpToBridge(
            "POST",
            "/call",
            json={
                "path": "storage/main/download_sign",
                "params": {"key": bad_key},
            },
            headers=jwt_headers(token_owner, project),
        )
        assert bad.status_code == 400
