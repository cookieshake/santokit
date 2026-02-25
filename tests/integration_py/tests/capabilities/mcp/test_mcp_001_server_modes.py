import json
import os
import subprocess
import time
from pathlib import Path

import pytest
import requests

from dsl import bootstrap_project

FIXTURE_DIR = "/workspace/tests/integration_py/fixtures/basic"

pytestmark = [pytest.mark.domain("mcp"), pytest.mark.capability("MCP-001")]


def _wait_for_sse(url: str, timeout_sec: float = 20.0) -> bool:
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            resp = requests.get(url, timeout=2, stream=True)
            try:
                if resp.status_code == 200:
                    return True
            finally:
                resp.close()
        except requests.RequestException:
            pass
        time.sleep(0.2)
    return False


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


def test_mcp_server_modes(compose_env):
    env = compose_env
    env.login_operator("owner@example.com", "password")
    repo_root = _repo_root()
    cli_bin = _build_cli(repo_root)

    base_env = os.environ.copy()
    base_env.update({"STK_HUB_URL": "http://localhost:4000"})

    missing_context = subprocess.run(
        [str(cli_bin), "mcp", "run"],
        cwd=repo_root,
        env=base_env,
        capture_output=True,
        text=True,
    )
    assert missing_context.returncode != 0
    assert "context not set" in (missing_context.stdout + missing_context.stderr)

    project = bootstrap_project(env, FIXTURE_DIR, "mcp_modes", "mcp-modes-r1")
    cli_env = base_env.copy()
    cli_env.update({"STK_PROJECT": project, "STK_ENV": "dev"})

    init = subprocess.run(
        [str(cli_bin), "mcp", "run"],
        cwd=repo_root,
        env=cli_env,
        input='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n',
        capture_output=True,
        text=True,
    )
    assert init.returncode == 0
    payload = json.loads(init.stdout.strip().splitlines()[-1])
    assert payload["jsonrpc"] == "2.0"
    assert payload["id"] == 1
    assert payload["result"]["serverInfo"]["name"] == "santokit"

    stdio_wait = subprocess.Popen(
        [str(cli_bin), "mcp", "run"],
        cwd=repo_root,
        env=cli_env,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        with pytest.raises(subprocess.TimeoutExpired):
            stdio_wait.wait(timeout=1)
    finally:
        stdio_wait.terminate()
        stdio_wait.wait(timeout=5)

    default_sse = subprocess.Popen(
        [str(cli_bin), "mcp", "start"],
        cwd=repo_root,
        env=cli_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        assert _wait_for_sse("http://127.0.0.1:8080/sse")
    finally:
        default_sse.terminate()
        try:
            default_sse.wait(timeout=5)
        except subprocess.TimeoutExpired:
            default_sse.kill()
            default_sse.wait(timeout=5)

    custom_sse = subprocess.Popen(
        [str(cli_bin), "mcp", "start", "--port", "18080"],
        cwd=repo_root,
        env=cli_env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )

    try:
        assert _wait_for_sse("http://127.0.0.1:18080/sse")
    finally:
        custom_sse.terminate()
        try:
            custom_sse.wait(timeout=5)
        except subprocess.TimeoutExpired:
            custom_sse.kill()
            custom_sse.wait(timeout=5)
