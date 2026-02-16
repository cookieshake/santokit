#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)

RUN_FROM_PLAN=0
VALIDATE_CAPS=1
CLEAR_VENV=0
DOMAIN=""
CAPABILITY=""
STATUS=""

while [ "$#" -gt 0 ]; do
    case "$1" in
        --from-plan)
            RUN_FROM_PLAN=1
            ;;
        --domain)
            DOMAIN="${2:-}"
            shift
            ;;
        --capability)
            CAPABILITY="${2:-}"
            shift
            ;;
        --status)
            STATUS="${2:-}"
            shift
            ;;
        --no-validate)
            VALIDATE_CAPS=0
            ;;
        --clear-venv)
            CLEAR_VENV=1
            ;;
        -h|--help)
            cat <<'EOF'
Usage: ./scripts/run-integration-tests.sh [options]

Options:
  --from-plan         Run only tests listed in capability test_refs
  --domain <domain>   Filter capability tests by domain (implies --from-plan)
  --capability <id>   Filter capability tests by capability id (implies --from-plan)
  --status <status>   Filter capability tests by status (implies --from-plan)
  --no-validate       Skip strict capability validation before test run
  --clear-venv        Recreate Python venv from scratch
  -h, --help          Show this help message
EOF
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            echo "Use --help to see supported options." >&2
            exit 2
            ;;
    esac
    shift
done

if [ -n "$DOMAIN" ] || [ -n "$CAPABILITY" ] || [ -n "$STATUS" ]; then
    RUN_FROM_PLAN=1
fi

if [ "$VALIDATE_CAPS" -eq 1 ]; then
    python3 "$ROOT_DIR/scripts/validate-capabilities.py"
fi

LIST_ARGS=""
if [ -n "$DOMAIN" ]; then
    LIST_ARGS="$LIST_ARGS --domain $DOMAIN"
fi
if [ -n "$CAPABILITY" ]; then
    LIST_ARGS="$LIST_ARGS --capability $CAPABILITY"
fi
if [ -n "$STATUS" ]; then
    LIST_ARGS="$LIST_ARGS --status $STATUS"
fi

if [ "$RUN_FROM_PLAN" -eq 1 ]; then
    # shellcheck disable=SC2086
    SELECTED_TESTS=$(python3 "$ROOT_DIR/scripts/list-capability-tests.py" --format shell --strip-prefix tests/integration_py/ $LIST_ARGS)
    if [ -z "$SELECTED_TESTS" ]; then
        echo "No tests matched the provided capability filters." >&2
        exit 1
    fi
else
    SELECTED_TESTS=""
fi

if [ "$CLEAR_VENV" -eq 1 ]; then
    VENV_ARGS="--clear"
else
    VENV_ARGS=""
fi

if [ -n "$SELECTED_TESTS" ]; then
    flox activate -- sh -lc "cd tests/integration_py && uv venv $VENV_ARGS && uv pip install -e . && uv run pytest $SELECTED_TESTS"
else
    flox activate -- sh -lc "cd tests/integration_py && uv venv $VENV_ARGS && uv pip install -e . && uv run pytest"
fi
