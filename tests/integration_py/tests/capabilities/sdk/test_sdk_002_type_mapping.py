import pytest

from dsl import bootstrap_project

FIXTURE_OK = "/workspace/tests/integration_py/fixtures/sdk_type_mapping"
FIXTURE_BAD = "/workspace/tests/integration_py/fixtures/sdk_type_mapping_unknown"

pytestmark = [pytest.mark.domain("sdk"), pytest.mark.capability("SDK-002")]


def test_sdk_type_mapping(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    ok_project = bootstrap_project(env, FIXTURE_OK, "sdk_types", "sdk-types-1")
    out_ok = "/tmp/santokit-sdk/generated/types-client.ts"

    ok = env.runStkCli(
        (
            f"stk gen client --lang typescript --project {ok_project} --env dev "
            f"--output {out_ok}"
        ),
        workdir=FIXTURE_OK,
    )
    assert ok.exit_code == 0

    show = env.runStkCli(f"cat {out_ok}", workdir=FIXTURE_OK)
    content = show.output
    assert "id: string" in content  # bigint -> string
    assert "title: string" in content
    assert "count: number" in content
    assert "ratio: number" in content
    assert "amount: string" in content  # decimal -> string
    assert "enabled: boolean" in content
    assert "payload: unknown" in content
    assert "happened_at: string" in content
    assert "blob: string" in content
    assert "avatar: string" in content
    assert "tags: string[]" in content
    assert "matrix: number[]" in content
    assert "optional_amount: string | null" in content

    bad_project = bootstrap_project(
        env, FIXTURE_BAD, "sdk_types_bad", "sdk-types-bad-1"
    )
    out_bad = "/tmp/santokit-sdk/generated/types-client-bad.ts"

    bad = env.runStkCli(
        (
            f"stk gen client --lang typescript --project {bad_project} --env dev "
            f"--output {out_bad}"
        ),
        workdir=FIXTURE_BAD,
        check=False,
    )
    assert bad.exit_code != 0
    assert "unknown schema type 'uuidish'" in bad.output
    assert "column 'mystery'" in bad.output
