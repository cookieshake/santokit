import pytest

from dsl import bootstrap_project, jwt_headers, signup_and_login

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/storage_multipart"

pytestmark = [pytest.mark.domain("storage"), pytest.mark.capability("STORAGE-004")]


def test_storage_multipart_upload(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")
    project = bootstrap_project(env, FIXTURE_DIR, "storage_mp", "storage-mp-1")

    token = signup_and_login(env, project, "uploader@example.com", "pw123")
    headers = jwt_headers(token, project)

    create = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/multipart_create",
            "params": {
                "key": "videos/large.mp4",
                "contentType": "video/mp4",
                "contentLength": 10 * 1024 * 1024,
            },
        },
        headers=headers,
    )
    assert create.status_code == 200
    upload_id = create.json()["data"]["uploadId"]
    assert isinstance(upload_id, str) and upload_id

    sign_part = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/multipart_sign_part",
            "params": {
                "key": "videos/large.mp4",
                "uploadId": upload_id,
                "partNumber": 1,
                "contentLength": 5 * 1024 * 1024,
            },
        },
        headers=headers,
    )
    assert sign_part.status_code == 200
    assert sign_part.json()["data"]["method"] == "PUT"
    assert "uploadId=" in sign_part.json()["data"]["url"]

    complete = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/multipart_complete",
            "params": {
                "key": "videos/large.mp4",
                "uploadId": upload_id,
                "parts": [{"partNumber": 1, "etag": '"etag-1"'}],
            },
        },
        headers=headers,
    )
    assert complete.status_code == 200
    assert complete.json()["data"] == {}

    create2 = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/multipart_create",
            "params": {
                "key": "videos/abort.mp4",
                "contentType": "video/mp4",
                "contentLength": 8 * 1024 * 1024,
            },
        },
        headers=headers,
    )
    assert create2.status_code == 200
    upload_id2 = create2.json()["data"]["uploadId"]

    abort = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/multipart_abort",
            "params": {"key": "videos/abort.mp4", "uploadId": upload_id2},
        },
        headers=headers,
    )
    assert abort.status_code == 200
    assert abort.json()["data"] == {}

    oversize = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/multipart_create",
            "params": {
                "key": "videos/too-large.mp4",
                "contentType": "video/mp4",
                "contentLength": 25 * 1024 * 1024,
            },
        },
        headers=headers,
    )
    assert oversize.status_code == 400

    bad_type = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/multipart_create",
            "params": {
                "key": "videos/not-allowed.mov",
                "contentType": "video/quicktime",
                "contentLength": 5 * 1024 * 1024,
            },
        },
        headers=headers,
    )
    assert bad_type.status_code == 400

    no_credential = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/multipart_create",
            "params": {
                "key": "videos/no-auth.mp4",
                "contentType": "video/mp4",
                "contentLength": 5 * 1024 * 1024,
            },
        },
        headers={"X-Santokit-Project": project, "X-Santokit-Env": "dev"},
    )
    assert no_credential.status_code == 401

    denied = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/multipart_create",
            "params": {
                "key": "denied/blocked.mp4",
                "contentType": "video/mp4",
                "contentLength": 5 * 1024 * 1024,
            },
        },
        headers=headers,
    )
    assert denied.status_code == 403

    invalid_upload_id = env.httpToBridge(
        "POST",
        "/call",
        json={
            "path": "storage/main/multipart_sign_part",
            "params": {
                "key": "videos/large.mp4",
                "uploadId": "mpu_invalid",
                "partNumber": 1,
            },
        },
        headers=headers,
    )
    assert invalid_upload_id.status_code == 400
