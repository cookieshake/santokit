import pytest

from dsl import bootstrap_project, create_api_key, jwt_headers, signup_and_login

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/storage_upload_sign"

pytestmark = [pytest.mark.domain("storage"), pytest.mark.capability("STORAGE-001")]


def test_storage_upload_sign(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")
    project = bootstrap_project(env, FIXTURE_DIR, "storage_sign", "storage-sign-1")

    token = signup_and_login(env, project, "uploader@example.com", "pw123")
    auth_headers = jwt_headers(token, project)

    ok = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/upload_sign",
            "params": {
                "key": "avatars/123.jpg",
                "contentType": "image/jpeg",
                "contentLength": 204800,
            },
        },
        headers=auth_headers,
    )
    assert ok.status_code == 200
    data = ok.json()["data"]
    assert data["method"] == "PUT"
    assert data["url"].startswith("https://")
    assert data["headers"]["Content-Type"] == "image/jpeg"

    for bad_key in ["../avatars/x.jpg", "/avatars/x.jpg", "avatars//x.jpg"]:
        bad = env.httpToBridge(
            "POST",
            "/call",
            json={
                "path": "storage/main/upload_sign",
                "params": {
                    "key": bad_key,
                    "contentType": "image/jpeg",
                    "contentLength": 1024,
                },
            },
            headers=auth_headers,
        )
        assert bad.status_code == 400

    oversize = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/upload_sign",
            "params": {
                "key": "avatars/big.jpg",
                "contentType": "image/jpeg",
                "contentLength": 6 * 1024 * 1024,
            },
        },
        headers=auth_headers,
    )
    assert oversize.status_code == 400

    bad_type = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/upload_sign",
            "params": {
                "key": "avatars/file.gif",
                "contentType": "image/gif",
                "contentLength": 1024,
            },
        },
        headers=auth_headers,
    )
    assert bad_type.status_code == 400

    missing_length = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/upload_sign",
            "params": {"key": "avatars/nolen.jpg", "contentType": "image/jpeg"},
        },
        headers=auth_headers,
    )
    assert missing_length.status_code == 400

    missing_type = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/upload_sign",
            "params": {"key": "avatars/notype.jpg", "contentLength": 1024},
        },
        headers=auth_headers,
    )
    assert missing_type.status_code == 400

    no_credential = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/upload_sign",
            "params": {
                "key": "avatars/public.jpg",
                "contentType": "image/jpeg",
                "contentLength": 1024,
            },
        },
        headers={"X-Santokit-Project": project, "X-Santokit-Env": "dev"},
    )
    assert no_credential.status_code == 401

    api_key = create_api_key(
        env, project, FIXTURE_DIR, name="storage-agent", roles="server"
    )
    wrong_role = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/upload_sign",
            "params": {
                "key": "avatars/by-apikey.jpg",
                "contentType": "image/jpeg",
                "contentLength": 1024,
            },
        },
        headers={
            "X-Santokit-Api-Key": api_key,
            "X-Santokit-Project": project,
            "X-Santokit-Env": "dev",
        },
    )
    assert wrong_role.status_code == 403

    cond_false = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/upload_sign",
            "params": {
                "key": "denied/blocked.jpg",
                "contentType": "image/jpeg",
                "contentLength": 1024,
            },
        },
        headers=auth_headers,
    )
    assert cond_false.status_code == 403

    no_policy = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/upload_sign",
            "params": {
                "key": "documents/readme.txt",
                "contentType": "text/plain",
                "contentLength": 10,
            },
        },
        headers=auth_headers,
    )
    assert no_policy.status_code == 403
