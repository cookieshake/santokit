# Santokit Integration Tests

End-to-end integration testing suite for the Santokit ecosystem. These tests validate how the CLI, Hub, Bridge, and Client work together in realistic environments.

## What Is Covered

- Schema planning and migrations
- Logic bundle execution through the Bridge
- Client SDK calls against a live runtime
- Auth and secret handling in the Hub

## Prerequisites

- Docker (required by Testcontainers)
- Node.js 18+

## Running Tests

```bash
cd packages/integration-tests

npm install
npm test
```

Run a single test file:

```bash
npx vitest run test/integration/flows/logic-apply-sync.test.ts --sequence.concurrent=false
```

## Environment Overrides (Optional)

- `DATABASE_URL`: Postgres URL used by the Bridge test runtime
- `REDIS_URL`: Redis URL used by the Bridge test runtime
- `STK_HUB_URL`: Hub base URL used by CLI tests
- `STK_PROJECT_ID`: Project ID used by CLI tests
- `STK_TOKEN`: Auth token used by CLI tests
- `STK_DISABLE_AUTH`: Disable auth for local integration runs

## Test Structure

- `test/`: Test specifications
- `vitest.config.ts`: Runner configuration

## Tips

- Make sure Docker is running before you start the tests.
- If tests hang, check container pull logs and network access.
