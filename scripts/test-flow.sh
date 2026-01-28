#!/bin/bash
set -e

# Initialize Go Workspace if not exists
if [ ! -f go.work ]; then
    echo "🔧 Initializing Go Workspace..."
    go work init
    go work use packages/cli
    go work use packages/hub
fi

# Cleanup
echo "🧹 Cleaning up previous run..."
pkill -f "santoki-hub" || true
pkill -f "run-server.ts" || true
rm -rf ~/.santoki/tmp/kv
rm -rf logic # Clean up copied logic

# 1. Start Hub
echo "Starting Hub..."
export STK_HUB_ADDR=":8080"
# export STK_ENCRYPTION_KEY="32-byte-key-for-aes-256-gcm!!!" # Rely on default
go run packages/hub/cmd/hub/main.go &
HUB_PID=$!
sleep 2 # Wait for Hub to start

# 2. Start Server
echo "Starting Server..."
# We need ts-node. If not installed globally, use npx
npx ts-node --esm --experimental-specifier-resolution=node scripts/run-server.ts &
SERVER_PID=$!
sleep 2 # Wait for Server to start

# 3. CLI Push
echo "Running CLI Push..."
export STK_HUB_URL="http://localhost:8080"
export STK_TOKEN="dummy-token"
export STK_PROJECT_ID="default"

# Setup logic directory
echo "📂 Setting up logic directory from sample..."
cp -r examples/sample-project/logic logic

# We run from the root so it scans ./logic correctly
# With go.work, this should now work
go run packages/cli/cmd/stk/main.go logic push

# 4. Run Client
echo "Running Client Test..."
npx ts-node --esm --experimental-specifier-resolution=node scripts/run-client.ts

# Cleanup
echo "✅ Test Complete. Cleaning up..."
kill $HUB_PID
kill $SERVER_PID
rm -rf logic
