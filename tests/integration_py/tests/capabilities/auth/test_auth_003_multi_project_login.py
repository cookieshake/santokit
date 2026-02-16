import pytest

from dsl import bootstrap_project, signup_and_login

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

pytestmark = [pytest.mark.domain("auth"), pytest.mark.capability("AUTH-003")]


def test_enduser_multi_project_login(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project_a = bootstrap_project(env, FIXTURE_DIR, "multi_a", "enduser-1")
    project_b = bootstrap_project(env, FIXTURE_DIR, "multi_b", "enduser-1")

    email = "user@example.com"
    password = "pw123"
    token_a = signup_and_login(env, project_a, email, password)
    token_b = signup_and_login(env, project_b, email, password)
    assert token_a != token_b

    resp_a_ok = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"limit": 1}},
        headers={
            "Authorization": f"Bearer {token_a}",
            "X-Santokit-Project": project_a,
            "X-Santokit-Env": "dev",
        },
    )
    assert resp_a_ok.status_code == 200

    resp_a_bad = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"limit": 1}},
        headers={
            "Authorization": f"Bearer {token_a}",
            "X-Santokit-Project": project_b,
            "X-Santokit-Env": "dev",
        },
    )
    assert resp_a_bad.status_code == 403

    resp_b_bad = env.httpToBridge(
        "POST",
        "/call",
        json={"path": "db/users/select", "params": {"limit": 1}},
        headers={
            "Authorization": f"Bearer {token_b}",
            "X-Santokit-Project": project_a,
            "X-Santokit-Env": "dev",
        },
    )
    assert resp_b_bad.status_code == 403
