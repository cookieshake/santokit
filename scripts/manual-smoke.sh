#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_DIR="$ROOT_DIR/tests/integration_py"

HUB_URL="${HUB_URL:-http://localhost:4000}"
BRIDGE_URL="${BRIDGE_URL:-http://localhost:3000}"
ENV_NAME="${ENV_NAME:-dev}"
KEEP_UP="${KEEP_UP:-0}"

PROJECT="${PROJECT:-manual_$(date +%s)}"
DB_NAME="${DB_NAME:-stk_${PROJECT}}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command not found: $1" >&2
    exit 1
  fi
}

json_field() {
  local field="$1"
  python3 -c "import json,sys; print(json.load(sys.stdin)['$field'])"
}

cleanup() {
  if [[ "$KEEP_UP" == "1" ]]; then
    echo "KEEP_UP=1: leaving docker compose stack running"
    return
  fi
  echo "Shutting down docker compose stack..."
  docker compose -f "$COMPOSE_DIR/docker-compose.yaml" down -v >/dev/null
}

trap cleanup EXIT

require_cmd docker
require_cmd curl
require_cmd python3

echo "[1/8] Starting services..."
docker compose -f "$COMPOSE_DIR/docker-compose.yaml" up -d --build >/dev/null

echo "[2/8] Logging in operator..."
STK_AUTH_TOKEN="$({
  curl -sS -X POST "$HUB_URL/api/auth/login" \
    -H "Content-Type: application/json" \
    -d '{"email":"owner@example.com","password":"password"}'
} | json_field token)"

echo "[3/8] Ensuring project database '$DB_NAME'..."
docker compose -f "$COMPOSE_DIR/docker-compose.yaml" exec -T db sh -lc \
  "psql -U stk -d postgres -tAc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\" | grep -q 1 || psql -U stk -d postgres -c \"CREATE DATABASE ${DB_NAME};\"" >/dev/null

echo "[4/8] Creating project/env/connection + apply fixture..."
docker compose -f "$COMPOSE_DIR/docker-compose.yaml" exec -T cli sh -lc "
cd /workspace/tests/integration_py/fixtures/logics_call && \
STK_HUB_URL=http://hub:4000 STK_AUTH_TOKEN=$STK_AUTH_TOKEN stk project create $PROJECT && \
STK_HUB_URL=http://hub:4000 STK_AUTH_TOKEN=$STK_AUTH_TOKEN stk env create --project $PROJECT $ENV_NAME && \
STK_HUB_URL=http://hub:4000 STK_AUTH_TOKEN=$STK_AUTH_TOKEN stk connections set --project $PROJECT --env $ENV_NAME --name main --engine postgres --db-url postgres://stk:stk@db:5432/$DB_NAME && \
STK_HUB_URL=http://hub:4000 STK_AUTH_TOKEN=$STK_AUTH_TOKEN stk apply --project $PROJECT --env $ENV_NAME --ref manual-smoke
" >/dev/null

echo "[5/8] Calling public logic..."
PUBLIC_LOGIC_RESPONSE="$(curl -sS -X POST "$BRIDGE_URL/call" \
  -H "Content-Type: application/json" \
  -d '{"path":"logics/public_hello"}')"

echo "[6/8] Creating API key..."
API_KEY="$({
  curl -sS -X POST "$HUB_URL/api/apikeys/create" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $STK_AUTH_TOKEN" \
    -d "{\"project\":\"$PROJECT\",\"env\":\"$ENV_NAME\",\"name\":\"manual-smoke\",\"roles\":[\"admin\"]}"
} | json_field api_key)"

echo "[7/8] Calling db/items/select with API key..."
SELECT_RESPONSE="$(curl -sS -X POST "$BRIDGE_URL/call" \
  -H "Content-Type: application/json" \
  -H "X-Santokit-Project: $PROJECT" \
  -H "X-Santokit-Env: $ENV_NAME" \
  -H "X-Santokit-Api-Key: $API_KEY" \
  -d '{"path":"db/items/select"}')"

echo "[8/8] Done"
echo
echo "Project: $PROJECT"
echo "Env: $ENV_NAME"
echo "DB: $DB_NAME"
echo "Public logic response: $PUBLIC_LOGIC_RESPONSE"
echo "DB select response: $SELECT_RESPONSE"
echo
echo "Tip: set KEEP_UP=1 to keep the stack running after the script exits."
