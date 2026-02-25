import json
import os
import subprocess
from pathlib import Path

import pytest

from dsl import unique_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

pytestmark = [pytest.mark.domain("mcp"), pytest.mark.capability("MCP-004")]


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[5]


def _build_cli(repo_root: Path) -> Path:
    subprocess.run(
        ["cargo", "build", "-p", "stk-cli"],
        cwd=repo_root,
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
    )
    return repo_root / "target" / "debug" / "stk-cli"


def _mcp_release_current(
    cli_bin: Path, repo_root: Path, env: dict, req_id: int
) -> dict:
    payload = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}}
    )
    payload += "\n"
    payload += json.dumps(
        {
            "jsonrpc": "2.0",
            "id": req_id,
            "method": "tools/call",
            "params": {"name": "release_current", "arguments": {}},
        }
    )
    payload += "\n"
    proc = subprocess.run(
        [str(cli_bin), "mcp", "run"],
        cwd=repo_root,
        env=env,
        input=payload,
        capture_output=True,
        text=True,
    )
    assert proc.returncode == 0
    lines = [line for line in proc.stdout.splitlines() if line.strip()]
    return json.loads(lines[-1])


def test_mcp_release_current_tool(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")
    project = unique_project("mcp_release")

    env.runStkCli(f"stk project create {project}", workdir=FIXTURE_DIR)
    env.runStkCli(f"stk env create --project {project} dev", workdir=FIXTURE_DIR)
    db_url = env.ensure_project_db(project)
    env.runStkCli(
        f"stk connections set --project {project} --env dev --name main --engine postgres --db-url {db_url}",
        workdir=FIXTURE_DIR,
    )
    env.runStkCli(
        f"stk apply --project {project} --env dev --ref mcp-release-r1",
        workdir=FIXTURE_DIR,
    )

    repo_root = _repo_root()
    cli_bin = _build_cli(repo_root)
    cli_env = os.environ.copy()
    cli_env.update(
        {
            "STK_HUB_URL": "http://localhost:4000",
            "STK_PROJECT": project,
            "STK_ENV": "dev",
            "STK_AUTH_TOKEN": "operator-token",
        }
    )

    first = _mcp_release_current(cli_bin, repo_root, cli_env, 2)
    assert first["id"] == 2
    assert first["result"]["project"] == project
    assert first["result"]["env"] == "dev"
    release_id_1 = first["result"]["releaseId"]
    assert release_id_1

    env.runStkCli(
        f"stk apply --project {project} --env dev --ref mcp-release-r2",
        workdir=FIXTURE_DIR,
    )

    second = _mcp_release_current(cli_bin, repo_root, cli_env, 3)
    assert second["id"] == 3
    release_id_2 = second["result"]["releaseId"]
    assert release_id_2
    assert release_id_2 != release_id_1
