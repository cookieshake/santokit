import pytest

from dsl import bootstrap_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

pytestmark = [pytest.mark.domain("sdk"), pytest.mark.capability("SDK-004")]


def test_sdk_error_handling_generation(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "sdk_err", "sdk-err-1")
    output_path = "/tmp/santokit-sdk/generated/error-client.ts"

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

    assert "export class SantokitError extends Error" in content
    assert "code: string" in content
    assert "requestId: string" in content
    assert "this.name = 'SantokitError'" in content

    assert "if (!res.ok) {" in content
    assert "const bodyErr = payload?.error ?? payload" in content
    assert "const code = bodyErr?.code ?? 'INTERNAL_ERROR'" in content
    assert (
        "const requestId = bodyErr?.requestId ?? res.headers.get('x-request-id') ?? ''"
        in content
    )
    assert "throw new SantokitError(code, message, requestId)" in content

    assert "const res = await fetch" in content
    assert "catch (err)" not in content
