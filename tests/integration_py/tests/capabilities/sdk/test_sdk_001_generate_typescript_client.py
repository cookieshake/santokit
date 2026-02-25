import pytest

from dsl import bootstrap_project, unique_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

pytestmark = [pytest.mark.domain("sdk"), pytest.mark.capability("SDK-001")]


def test_sdk_generate_typescript_client(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "sdk_gen", "sdk-gen-1")
    output_path = "/tmp/santokit-sdk/generated/client.ts"

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
    assert "export const releaseId =" in content
    assert "export const generatedBy =" in content
    assert "export interface UsersRow" in content
    assert "export interface UsersInsert" in content
    assert "db: {" in content
    assert 'users: new TableApi<UsersRow, UsersInsert>(call, "users")' in content

    no_release_project = unique_project("sdk_no_release")
    env.runStkCli(f"stk project create {no_release_project}", workdir=FIXTURE_DIR)
    env.runStkCli(
        f"stk env create --project {no_release_project} dev", workdir=FIXTURE_DIR
    )

    fail = env.runStkCli(
        (
            f"stk gen client --lang typescript --project {no_release_project} --env dev "
            f"--output /tmp/santokit-sdk/generated/missing.ts"
        ),
        workdir=FIXTURE_DIR,
        check=False,
    )
    assert fail.exit_code != 0
    assert "failed to load current release" in fail.output
