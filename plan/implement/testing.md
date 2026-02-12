# Testing Strategy

This document defines the testing approach for Santokit, including test types, coverage targets, fixtures, and CI/CD integration.

---

## 1. Test Pyramid

```
          ┌─────────────┐
          │     E2E     │  10%  (Full flow, real DB)
          │   ~50 tests │
          └─────────────┘
         ┌───────────────┐
         │  Integration  │  30%  (Multi-component, test DB)
         │  ~300 tests   │
         └───────────────┘
        ┌─────────────────┐
        │      Unit       │  60%  (Single function, mocked)
        │   ~1000 tests   │
        └─────────────────┘
```

**Philosophy:**
- **Unit tests**: Fast, isolated, test business logic
- **Integration tests**: Medium speed, test component interaction
- **E2E tests**: Slow, expensive, test critical user journeys

---

## 2. Coverage Targets

### 2.1 By Component

| Component | Unit | Integration | E2E | Total Target |
|-----------|------|-------------|-----|--------------|
| **core** (parser) | 90% | 10% | — | 90% |
| **sql** (query gen) | 85% | 15% | — | 85% |
| **bridge** | 70% | 25% | 5% | 80% |
| **hub** | 70% | 25% | 5% | 80% |
| **cli** | 60% | 30% | 10% | 75% |
| **client-sdk** | 80% | 20% | — | 80% |

### 2.2 By Feature Area

| Feature | Target | Critical Path |
|---------|--------|---------------|
| Schema parsing (YAML → IR) | 95% | Yes |
| SQL query generation (SeaQuery) | 90% | Yes |
| Permission evaluation (CEL) | 90% | Yes |
| CRUD operations | 85% | Yes |
| Custom Logic (SQL functions) | 80% | Yes |
| Pub/Sub & Cron | 80% | No |
| Storage (presigned URLs) | 75% | No |
| Audit logging | 70% | No |
| Operator RBAC | 75% | No |

### 2.3 Coverage Enforcement

**PR Merge Requirements:**
- Overall coverage ≥ 80%
- No file < 70% coverage (unless explicitly exempted)
- New code: ≥ 90% coverage (diff coverage)

**CI Checks:**
```bash
# Rust (cargo-tarpaulin)
cargo tarpaulin --out Xml --output-dir coverage

# TypeScript (c8)
c8 --reporter=lcov npm test

# Upload to Codecov
bash <(curl -s https://codecov.io/bash)
```

---

## 3. Unit Tests

### 3.1 Scope

Test individual functions in isolation with mocked dependencies.

**What to test:**
- Schema YAML parsing (`tables/*.yaml` → internal IR)
- SQL query generation (IR → SeaQuery → SQL string)
- CEL expression evaluation (rule matching)
- Permission logic (role → operations)
- Request validation (malformed input)
- Error handling (boundary conditions)

**What NOT to test:**
- External APIs (DB, S3, Pub/Sub) → Use integration tests
- Multi-component flows → Use E2E tests

### 3.2 Structure

```
packages/
├── core/
│   ├── src/
│   │   ├── schema/
│   │   │   ├── parser.rs
│   │   │   └── ...
│   │   └── ...
│   └── tests/
│       └── unit/
│           ├── schema_parser_test.rs
│           ├── cel_evaluator_test.rs
│           └── ...
```

### 3.3 Examples

#### Example: Schema YAML Parsing

```rust
// packages/core/tests/unit/schema_parser_test.rs

#[test]
fn test_parse_table_schema() {
    let yaml = r#"
      name: users
      columns:
        - name: id
          type: uuid
          primaryKey: true
        - name: email
          type: text
          unique: true
    "#;

    let table = parse_table_yaml(yaml).unwrap();

    assert_eq!(table.name, "users");
    assert_eq!(table.columns.len(), 2);
    assert_eq!(table.columns[0].name, "id");
    assert!(table.columns[0].primary_key);
    assert_eq!(table.columns[1].name, "email");
    assert!(table.columns[1].unique);
}

#[test]
fn test_parse_table_schema_missing_primary_key() {
    let yaml = r#"
      name: logs
      columns:
        - name: message
          type: text
    "#;

    let result = parse_table_yaml(yaml);

    assert!(result.is_err());
    assert_eq!(
        result.unwrap_err().to_string(),
        "Table must have at least one primary key column"
    );
}
```

#### Example: SQL Query Generation

```rust
// packages/sql/tests/unit/query_builder_test.rs

#[test]
fn test_select_with_where() {
    let query = SelectQuery {
        table: "users".to_string(),
        columns: vec!["id", "name"],
        where_clause: Some(WhereClause {
            conditions: vec![
                Condition::Eq("status", Value::String("active")),
            ],
        }),
    };

    let sql = generate_sql(&query).unwrap();

    assert_eq!(
        sql,
        r#"SELECT "id", "name" FROM "users" WHERE "status" = 'active'"#
    );
}

#[test]
fn test_select_with_fk_expansion() {
    let query = SelectQuery {
        table: "posts".to_string(),
        columns: vec!["id", "title"],
        expand: Some(vec![
            Expand {
                relation: "author",
                columns: vec!["name", "email"],
            },
        ]),
    };

    let sql = generate_sql(&query).unwrap();

    assert!(sql.contains("LEFT JOIN \"users\""));
    assert!(sql.contains("\"users\".\"name\""));
}
```

#### Example: CEL Expression Evaluation

```rust
// packages/core/tests/unit/cel_evaluator_test.rs

#[test]
fn test_cel_expression_auth_role() {
    let expr = "auth.role == 'admin'";
    let context = json!({
        "auth": { "role": "admin" },
        "resource": { "id": "123" }
    });

    let result = evaluate_cel(expr, &context).unwrap();

    assert_eq!(result, Value::Bool(true));
}

#[test]
fn test_cel_expression_missing_key() {
    let expr = "auth.userId == resource.ownerId";
    let context = json!({
        "auth": {},  // userId missing
        "resource": { "ownerId": "123" }
    });

    let result = evaluate_cel(expr, &context);

    // Should fail gracefully
    assert!(result.is_err());
    assert!(result.unwrap_err().to_string().contains("no such key"));
}

#[test]
fn test_cel_expression_safe_access() {
    let expr = "has(auth.userId) && auth.userId == resource.ownerId";
    let context = json!({
        "auth": {},  // userId missing
        "resource": { "ownerId": "123" }
    });

    let result = evaluate_cel(expr, &context).unwrap();

    // Safe access: has() returns false, so expression short-circuits
    assert_eq!(result, Value::Bool(false));
}
```

---

## 4. Integration Tests

### 4.1 Scope

Test multiple components working together with real test database.

**What to test:**
- Bridge + PostgreSQL (schema apply + CRUD)
- Hub + PostgreSQL (release management)
- CLI + Mock Hub API (command execution)
- Event publish + subscription handler
- Storage presigned URL generation + S3 mock

### 4.2 Test Fixtures

Pre-configured project layouts for testing:

```
tests/fixtures/
├── basic_crud/              # Simple table, CRUD only
│   ├── config/
│   │   ├── schema.yaml
│   │   └── permissions.yaml
│   └── tables/
│       └── users.yaml
│
├── column_permissions/      # Column-level ACL
│   └── ...
│
├── fk_expansion/            # Foreign key relationships
│   └── ...
│
├── custom_logic/            # SQL functions
│   └── ...
│
├── pub_sub/                 # Event topics + subscriptions
│   └── ...
│
└── storage/                 # S3 presigned URLs
    └── ...
```

### 4.3 Structure

```
packages/
├── bridge/
│   └── tests/
│       └── integration/
│           ├── crud_test.rs
│           ├── permissions_test.rs
│           ├── fk_expansion_test.rs
│           └── ...
```

### 4.4 Examples

#### Example: CRUD with Permissions

```rust
// packages/bridge/tests/integration/crud_test.rs

#[tokio::test]
async fn test_crud_with_permissions() {
    // Setup: Load fixture and start test Bridge
    let fixture = load_fixture("column_permissions").await;
    let bridge = spawn_test_bridge(fixture).await;
    let admin_key = create_api_key("admin").await;
    let user_key = create_api_key("regular_user").await;

    // Test 1: Admin can insert all columns
    let res = bridge.call(
        "/db/users/insert",
        admin_key,
        json!({
            "name": "Alice",
            "email": "alice@example.com",
            "internal_notes": "VIP customer"
        })
    ).await;

    assert_eq!(res.status(), 200);
    let data = res.json::<InsertResponse>().await;
    assert_eq!(data.id, "user_1");

    // Test 2: Regular user can query, but internal_notes hidden
    let res = bridge.call(
        "/db/users/select",
        user_key,
        json!({
            "where": { "name": "Alice" }
        })
    ).await;

    assert_eq!(res.status(), 200);
    let data = res.json::<SelectResponse>().await;
    assert_eq!(data.data.len(), 1);
    assert_eq!(data.data[0]["name"], "Alice");
    assert_eq!(data.data[0]["email"], "alice@example.com");
    assert!(data.data[0].get("internal_notes").is_none());  // Hidden

    // Test 3: Regular user cannot insert internal_notes
    let res = bridge.call(
        "/db/users/insert",
        user_key,
        json!({
            "name": "Bob",
            "internal_notes": "Should be blocked"
        })
    ).await;

    assert_eq!(res.status(), 403);  // FORBIDDEN
    let error = res.json::<ErrorResponse>().await;
    assert_eq!(error.error, "FORBIDDEN");
}
```

#### Example: FK Expansion

```rust
// packages/bridge/tests/integration/fk_expansion_test.rs

#[tokio::test]
async fn test_fk_expansion_one_level() {
    let fixture = load_fixture("fk_expansion").await;
    let bridge = spawn_test_bridge(fixture).await;

    // Setup: Insert user and post
    bridge.call("/db/users/insert", admin_key, json!({
        "id": "user_1",
        "name": "Alice"
    })).await;

    bridge.call("/db/posts/insert", admin_key, json!({
        "id": "post_1",
        "title": "Hello World",
        "author_id": "user_1"
    })).await;

    // Test: Select post with author expansion
    let res = bridge.call(
        "/db/posts/select",
        admin_key,
        json!({
            "where": { "id": "post_1" },
            "expand": ["author"]
        })
    ).await;

    let data = res.json::<SelectResponse>().await;
    assert_eq!(data.data[0]["title"], "Hello World");
    assert_eq!(data.data[0]["author"]["name"], "Alice");
}

#[tokio::test]
async fn test_fk_expansion_depth_limit() {
    // Test that expansion depth > 3 returns error
    let res = bridge.call(
        "/db/posts/select",
        admin_key,
        json!({
            "expand": ["author.team.org.parent"]  // 4 levels
        })
    ).await;

    assert_eq!(res.status(), 400);
    let error = res.json::<ErrorResponse>().await;
    assert_eq!(error.error, "BAD_REQUEST");
    assert!(error.message.contains("expansion depth limit"));
}
```

#### Example: Custom Logic Transaction

```rust
// packages/bridge/tests/integration/custom_logic_test.rs

#[tokio::test]
async fn test_custom_logic_purchase_transaction() {
    let fixture = load_fixture("custom_logic").await;
    let bridge = spawn_test_bridge(fixture).await;

    // Setup: User with balance
    bridge.call("/db/users/insert", admin_key, json!({
        "id": "user_1",
        "balance": 100.0
    })).await;

    // Setup: Product with stock
    bridge.call("/db/products/insert", admin_key, json!({
        "id": "product_1",
        "price": 30.0,
        "stock": 5
    })).await;

    // Test: Purchase (custom logic function)
    let res = bridge.call(
        "/logic/purchase",
        user_key,
        json!({
            "product_id": "product_1",
            "quantity": 2
        })
    ).await;

    assert_eq!(res.status(), 200);
    let result = res.json::<Value>().await;
    assert_eq!(result["new_balance"], 40.0);  // 100 - (30 * 2)
    assert_eq!(result["new_stock"], 3);       // 5 - 2

    // Verify: Check database state
    let user = bridge.call("/db/users/select", admin_key, json!({
        "where": { "id": "user_1" }
    })).await.json::<SelectResponse>().await;
    assert_eq!(user.data[0]["balance"], 40.0);

    let product = bridge.call("/db/products/select", admin_key, json!({
        "where": { "id": "product_1" }
    })).await.json::<SelectResponse>().await;
    assert_eq!(product.data[0]["stock"], 3);
}

#[tokio::test]
async fn test_custom_logic_transaction_rollback() {
    // Test: Purchase with insufficient balance (should rollback)
    let res = bridge.call(
        "/logic/purchase",
        user_key,
        json!({
            "product_id": "product_1",
            "quantity": 10  // Total: 300, but balance: 100
        })
    ).await;

    assert_eq!(res.status(), 400);
    let error = res.json::<ErrorResponse>().await;
    assert_eq!(error.error, "INSUFFICIENT_BALANCE");

    // Verify: Database unchanged (transaction rolled back)
    let user = bridge.call("/db/users/select", admin_key, json!({
        "where": { "id": "user_1" }
    })).await.json::<SelectResponse>().await;
    assert_eq!(user.data[0]["balance"], 100.0);  // Unchanged

    let product = bridge.call("/db/products/select", admin_key, json!({
        "where": { "id": "product_1" }
    })).await.json::<SelectResponse>().await;
    assert_eq!(product.data[0]["stock"], 5);  // Unchanged
}
```

---

## 5. E2E Tests

### 5.1 Scope

Test full operator and end-user workflows with real components (Hub, Bridge, DB, CLI).

**What to test:**
- Operator workflow: `stk init` → `stk apply` → verify Bridge
- GitOps flow: commit → CI → `stk apply` → `stk release promote`
- End-user authentication: signup → login → CRUD → refresh token
- Schema evolution: add column → deploy → verify backward compat

### 5.2 Test Scenarios (Mapped to Flows)

| Flow Doc | Test Scenario | Fixture | Priority |
|----------|---------------|---------|----------|
| `flows/operator.md` | Bootstrap new project | e2e/bootstrap | P0 |
| `flows/crud.md` | CRUD with FK expansion | e2e/fk_expansion | P0 |
| `flows/auth.md` | End User signup + CRUD | e2e/auth_flow | P0 |
| `flows/logics.md` | Custom SQL transaction | e2e/purchase_logic | P1 |
| `flows/security.md` | Permission bypass attempt | e2e/security_tests | P0 |

### 5.3 Structure

```
tests/e2e/
├── bootstrap/
│   ├── test_bootstrap.sh
│   └── expected_output.txt
├── fk_expansion/
│   └── test_fk_expansion.sh
├── auth_flow/
│   └── test_auth_flow.sh
└── ...
```

### 5.4 Example: Bootstrap Flow

```bash
#!/bin/bash
# tests/e2e/bootstrap/test_bootstrap.sh

set -e  # Exit on error

# Setup
TEST_ORG="test-org-$(date +%s)"
TEST_PROJECT="test-project"
TEST_DIR=$(mktemp -d)

cd $TEST_DIR

# Step 1: Initialize project
stk init --org $TEST_ORG --project $TEST_PROJECT

# Verify: Directory structure created
test -f schema.yaml
test -d tables/
test -f permissions.yaml

# Step 2: Create table
cat > tables/users.yaml <<EOF
name: users
columns:
  - name: id
    type: uuid
    primaryKey: true
  - name: name
    type: text
EOF

# Step 3: Apply to dev environment
stk apply --env dev

# Verify: Release created
RELEASE_ID=$(stk releases current --env dev --format json | jq -r '.releaseId')
test -n "$RELEASE_ID"

# Step 4: Test CRUD via Bridge
API_KEY=$(stk apikeys create --env dev --name "test-key" --format json | jq -r '.key')

curl -X POST \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice"}' \
  https://bridge.dev.example.com/db/users/insert

# Verify: Insert succeeded
RESPONSE=$(curl -H "Authorization: Bearer $API_KEY" \
  https://bridge.dev.example.com/db/users/select)

echo $RESPONSE | jq -e '.data | length == 1'
echo $RESPONSE | jq -e '.data[0].name == "Alice"'

# Cleanup
stk project delete --org $TEST_ORG --project $TEST_PROJECT --force
rm -rf $TEST_DIR

echo "✅ Bootstrap E2E test passed"
```

---

## 6. Contract Tests (Hub ↔ Bridge)

### 6.1 Scope

Verify API contracts between Hub and Bridge remain stable across versions.

**Contracts to test:**
- `GET /internal/releases/current`
- `GET /internal/releases/{releaseId}`
- `GET /internal/keys/{project}/{env}`

### 6.2 Tool

Use JSON schema validation or Pact (contract testing framework).

### 6.3 Example

```rust
// tests/contracts/release_payload_test.rs

#[test]
fn test_release_payload_schema() {
    // Load contract schema (versioned)
    let schema = load_contract_schema("release_payload_v1.json");

    // Mock Hub response
    let hub_response = mock_hub_release_response();

    // Validate
    let result = validate_json_schema(&hub_response, &schema);
    assert!(result.is_ok(), "Release payload schema mismatch: {}", result.unwrap_err());
}

#[test]
fn test_release_payload_backward_compat() {
    // Bridge v2.0 should understand release from Hub v2.1
    let hub_v21_response = load_fixture("release_v21.json");
    let bridge_v20 = BridgeV2_0::new();

    let result = bridge_v20.parse_release(&hub_v21_response);
    assert!(result.is_ok());
}
```

---

## 7. Chaos Testing

### 7.1 Scope

Test system resilience under failure conditions.

### 7.2 Scenarios

#### Scenario 1: Hub Downtime

**Test:** Bridge serves from cache when Hub unreachable

```rust
#[tokio::test]
async fn test_bridge_serves_from_cache_when_hub_down() {
    let bridge = spawn_test_bridge_with_hub().await;

    // Initial sync (Hub up)
    bridge.wait_for_ready().await;

    // Simulate Hub going down
    hub_mock.shutdown().await;

    // Bridge should continue serving (from cache)
    let res = bridge.call("/db/users/select", api_key, json!({})).await;
    assert_eq!(res.status(), 200);

    // Cache age should increase
    std::thread::sleep(Duration::from_secs(60));
    let status = bridge.status().await;
    assert!(status.cache_age_seconds > 60);
}

#[tokio::test]
async fn test_bridge_returns_503_when_cache_expires() {
    // Bridge with short max_stale (10 seconds)
    let bridge = spawn_test_bridge_with_config(json!({
        "release_cache": { "max_stale_seconds": 10 }
    })).await;

    // Hub down
    hub_mock.shutdown().await;

    // Wait for cache to expire
    std::thread::sleep(Duration::from_secs(15));

    // Bridge should return 503
    let res = bridge.call("/db/users/select", api_key, json!({})).await;
    assert_eq!(res.status(), 503);
}
```

#### Scenario 2: DB Connection Loss

**Test:** Bridge retries with backoff

```rust
#[tokio::test]
async fn test_bridge_retries_on_db_connection_loss() {
    let bridge = spawn_test_bridge().await;

    // Simulate DB connection loss (using toxiproxy)
    toxiproxy.set_toxic("db", Toxic::Timeout { timeout: 5000 }).await;

    // Request should fail after retries
    let res = bridge.call("/db/users/select", api_key, json!({})).await;
    assert_eq!(res.status(), 503);

    // Verify retries in logs
    let logs = bridge.logs().await;
    assert!(logs.iter().any(|l| l.contains("db_connection_retry")));

    // Restore connection
    toxiproxy.remove_toxic("db").await;

    // Request should succeed
    let res = bridge.call("/db/users/select", api_key, json!({})).await;
    assert_eq!(res.status(), 200);
}
```

#### Scenario 3: Slow Queries

**Test:** Query timeout enforced

```rust
#[tokio::test]
async fn test_query_timeout_enforced() {
    let bridge = spawn_test_bridge().await;

    // Insert large dataset
    for i in 0..100000 {
        bridge.call("/db/logs/insert", admin_key, json!({
            "message": format!("Log entry {}", i)
        })).await;
    }

    // Query without index (slow)
    let start = Instant::now();
    let res = bridge.call("/db/logs/select", api_key, json!({
        "where": { "message": { "$like": "%entry 99999%" } }
    })).await;

    let duration = start.elapsed();

    // Should timeout after 30s (default)
    assert_eq!(res.status(), 500);
    assert!(duration < Duration::from_secs(35));  // Some buffer

    let error = res.json::<ErrorResponse>().await;
    assert_eq!(error.error, "INTERNAL_ERROR");
    assert!(error.message.contains("timeout"));
}
```

### 7.3 Tools

- **toxiproxy**: Network chaos (latency, connection loss)
- **Docker Compose**: Service orchestration
- **Testcontainers**: PostgreSQL for tests

---

## 8. Performance Tests

### 8.1 Scope

Measure and validate system performance under load.

### 8.2 Tool

**k6** (Grafana k6) - Load testing framework

### 8.3 Scenarios

```javascript
// tests/performance/crud_load_test.js

import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '1m', target: 500 },   // Ramp up to 500 users
    { duration: '3m', target: 1000 },  // Ramp to 1000 users
    { duration: '1m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% under 500ms
    http_req_failed: ['rate<0.01'],    // Error rate < 1%
  },
};

export default function() {
  const API_KEY = __ENV.API_KEY;
  const BASE_URL = __ENV.BASE_URL;

  // Test: SELECT query
  let res = http.get(`${BASE_URL}/db/users/select`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 200ms': (r) => r.timings.duration < 200,
  });

  // Test: INSERT
  res = http.post(`${BASE_URL}/db/users/insert`, JSON.stringify({
    name: `User-${Date.now()}`,
    email: `user-${Date.now()}@example.com`,
  }), {
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  check(res, {
    'insert status is 200': (r) => r.status === 200,
  });
}
```

**Run:**
```bash
k6 run --env API_KEY=$STK_API_KEY --env BASE_URL=https://bridge.example.com \
  tests/performance/crud_load_test.js
```

### 8.4 Performance Targets

| Operation | p50 Latency | p95 Latency | p99 Latency |
|-----------|-------------|-------------|-------------|
| Simple SELECT (no FK) | < 50ms | < 200ms | < 500ms |
| SELECT with FK (1 level) | < 100ms | < 300ms | < 700ms |
| SELECT with FK (3 levels) | < 200ms | < 500ms | < 1s |
| INSERT | < 50ms | < 150ms | < 300ms |
| UPDATE | < 60ms | < 180ms | < 350ms |
| DELETE | < 40ms | < 120ms | < 250ms |
| Custom Logic (simple) | < 100ms | < 400ms | < 800ms |
| Custom Logic (complex) | < 500ms | < 1s | < 2s |
| Schema apply (10 tables) | < 5s | < 10s | < 15s |

---

## 9. Test Data Management

### 9.1 Strategy

**Unit/Integration Tests:**
- Use factories (builder pattern) to generate test data
- Example: `UserFactory::new().with_role("admin").build()`

**E2E Tests:**
- Seed with SQL files: `fixtures/*/seed.sql`

**Performance Tests:**
- Generate with `faker` libraries (realistic data)

### 9.2 Cleanup

**Unit/Integration:**
- Rollback transactions after each test (no persistent state)

**E2E:**
- Drop test database after run
- Isolated DB per test run (`test_db_${CI_JOB_ID}`)

**CI:**
- Ephemeral PostgreSQL instances (Testcontainers)

---

## 10. CI/CD Integration

### 10.1 Pipeline

```yaml
# .github/workflows/test.yml

stages:
  - lint
  - unit-test
  - integration-test
  - e2e-test
  - security-scan
  - build
  - deploy

lint:
  script:
    - cargo clippy -- -D warnings
    - npm run lint

unit-test:
  script:
    - cargo test --lib
  coverage:
    target: 80%
  artifacts:
    reports:
      coverage_report:
        coverage_format: cobertura
        path: coverage/cobertura.xml

integration-test:
  services:
    - postgres:15
  script:
    - cargo test --test integration
  artifacts:
    reports:
      junit: target/junit.xml

e2e-test:
  services:
    - postgres:15
  script:
    - ./scripts/run-e2e-tests.sh
  only:
    - main
    - /^release\/.*$/

performance-test:
  script:
    - k6 run tests/performance/crud_load_test.js
  only:
    - main

security-scan:
  script:
    - cargo audit
    - npm audit
```

### 10.2 Coverage Reports

**Tool:**
- Rust: `cargo-tarpaulin`
- TypeScript: `c8` (V8 coverage)

**Upload to:**
- Codecov or SonarQube

**PR Blocking:**
- Block merge if coverage drops > 2%

### 10.3 Test Result Reporting

**Format:**
- JUnit XML (for CI integration)

**Notifications:**
- Slack channel: `#ci-test-failures`

---

## 11. Test Maintenance

### 11.1 Test Ownership

- Each component has designated test owner
- Test owner reviews test failures and maintains fixtures

### 11.2 Flaky Test Policy

- Flaky test → Mark as `[flaky]` in title
- Fix within 1 week or disable
- Track flaky tests in dashboard

### 11.3 Test Performance

- Unit tests: < 10s total
- Integration tests: < 2 min total
- E2E tests: < 10 min total

**If exceeding:**
- Parallelize tests
- Optimize fixtures (use smaller datasets)

---

## 12. Related Documents

- **`plan/spec/ARCHITECTURE.md`** — System architecture overview
- **`plan/spec/schema.md`** — Schema management
- **`plan/spec/crud.md`** — CRUD operations
- **`plan/spec/events.md`** — Pub/Sub & Cron
- **`plan/flows/operator.md`** — Operator workflows

---

## Summary

**Testing Philosophy:**
1. **Test early, test often** — Catch bugs before production
2. **Prioritize critical paths** — Focus on core functionality
3. **Keep tests fast** — Fast feedback loop
4. **Maintain high coverage** — 80%+ overall
5. **Test failure scenarios** — Chaos testing for resilience

**Golden Rule:** Every bug is a missing test. Add test before fixing bug to prevent regression.
