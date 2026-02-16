import pytest

from dsl import bootstrap_project, jwt_headers

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

pytestmark = [pytest.mark.domain("auth"), pytest.mark.capability("AUTH-001")]


def test_enduser_login_hub_issuer(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "enduser", "enduser-1")

    signup = env.httpToHub(
        "POST",
        "/api/endusers/signup",
        json={
            "project": project,
            "env": "dev",
            "email": "user@example.com",
            "password": "pw",
        },
    )
    assert signup.status_code == 200

    login = env.httpToHub(
        "POST",
        "/api/endusers/login",
        json={
            "project": project,
            "env": "dev",
            "email": "user@example.com",
            "password": "pw",
        },
    )
    assert login.status_code == 200
    access_token = login.json()["access_token"]

    ok = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"limit": 1}},
        headers=jwt_headers(access_token, project),
    )
    assert ok.status_code == 200

    mismatch = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"limit": 1}},
        headers={
            "Authorization": f"Bearer {access_token}",
            "X-Santokit-Project": f"{project}-mismatch",
            "X-Santokit-Env": "dev",
        },
    )
    assert mismatch.status_code == 403
