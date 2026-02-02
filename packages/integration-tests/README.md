# Santokit Integration Tests

End-to-end integration testing suite for the Santokit ecosystem. These tests verify the correct interaction between the CLI, Client, Bridge, and Hub components.

## Overview

This package uses **Vitest** and **Testcontainers** to spin up ephemeral environments (PostgreSQL, Redis, etc.) and validate the full stack flows, including:
- Database migrations and schema management.
- Logic bundle execution via the Bridge.
- Client SDK interaction with the backend.

## Prerequisites

- Docker (for Testcontainers)
- Node.js 18+

## Running Tests

To run the full suite of integration tests:

```bash
# Install dependencies
npm install

# Run tests
npm test
```

## Test Structure

- `test/`: Contains the test specifications.
- `vitest.config.ts`: Configuration for the Vitest runner.

## Adding Tests

New tests should focus on user-facing scenarios, ensuring that `stk` commands, `client` calls, and `bridge` execution behave as expected in a real-world-like environment.
