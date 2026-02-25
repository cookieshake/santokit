import pytest

from dsl import bootstrap_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

pytestmark = [pytest.mark.domain("sdk"), pytest.mark.capability("SDK-005")]


def test_sdk_auth_integration_generation(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "sdk_auth", "sdk-auth-1")
    output_path = "/tmp/santokit-sdk/generated/auth-client.ts"

    gen = env.runStkCli(
        (
            f"stk gen client --lang typescript --project {project} --env dev "
            f"--output {output_path}"
        ),
        workdir=FIXTURE_DIR,
    )
    assert gen.exit_code == 0

    show = env.runStkCli(f"cat {output_path}", workdir=FIXTURE_DIR)
    content = show.output

    assert "apiKey?: string" in content
    assert "accessToken?: string" in content
    assert "const hasApiKey = !!options.apiKey" in content
    assert "const hasAccessToken = !!options.accessToken" in content
    assert "Exactly one of apiKey or accessToken must be provided" in content

    assert "headers['X-Santokit-Api-Key'] = options.apiKey" in content
    assert "headers.Authorization = `Bearer ${options.accessToken}`" in content

    assert "getAccessToken" not in content
