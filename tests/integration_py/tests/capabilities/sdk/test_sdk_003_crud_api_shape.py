import pytest

from dsl import bootstrap_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

pytestmark = [pytest.mark.domain("sdk"), pytest.mark.capability("SDK-003")]


def test_sdk_crud_api_shape(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")

    project = bootstrap_project(env, FIXTURE_DIR, "sdk_crud", "sdk-crud-1")
    output_path = "/tmp/santokit-sdk/generated/crud-client.ts"

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

    assert "async select(params: {" in content
    assert "where?: Partial<TRow>" in content
    assert "orderBy?: Record<string, 'asc' | 'desc'>" in content
    assert "limit?: number" in content
    assert "offset?: number" in content
    assert "expand?: string[]" in content

    assert "async insert(data: TInsert | TInsert[]): Promise<TRow[]>" in content
    assert "Array.isArray(data) ? { values: data } : { data }" in content

    assert (
        "async update(where: Partial<TRow>, data: Partial<TInsert>): Promise<TRow[]>"
        in content
    )
    assert "return this.select({ where })" in content

    assert (
        "async delete(where: Partial<TRow>): Promise<{ affected: number }>" in content
    )

    assert "db: {" in content
    assert 'users: new TableApi<UsersRow, UsersInsert>(call, "users")' in content
    assert "ghosts:" not in content
