#!/bin/sh
set -e

flox activate -- sh -lc 'cd tests/integration_py && UV_VENV_CLEAR=1 uv venv --clear && uv pip install -e . && uv run pytest'
