# Flow 15: Custom Logics Call (`/call`)

## Overview
Tests the Custom Logics feature, which allows managing SQL functions as files and executing them via the `/call` API endpoint.

## Fixture: `logics_call`
- **Schema**: `items` table with `id`, `name`, `price`, `owner_id`
- **Permissions**: All CRUD operations allowed for authenticated users
- **Logics**:
  - `whoami.sql`: Returns `:auth.sub` (system variable)
  - `get_items.sql`: SELECT with required `owner_id` parameter
  - `insert_item.sql`: Execute-only INSERT (no RETURNING)
  - `public_hello.sql`: `auth: public` logic
  - `admin_only.sql`: Role-restricted logic (`roles: [admin]`)
  - `default_params.sql`: Parameters with default values

## Test Scenarios

### B1: whoami — System Variable Access
**Purpose**: Verify `:auth.sub` system variable is correctly injected

**Steps**:
1. Call `whoami` logic as authenticated user
2. Verify response contains `data.data[0].sub` matching user ID

**Expected**:
- Status: 200
- Response: `{"data": {"data": [{"sub": "<user_id>"}]}}`

---

### B2: public_hello — Public Auth Logic
**Purpose**: Verify `auth: public` logic can be called by authenticated users

**Note**: Although logic is marked `auth: public`, the Bridge's `authenticate()` gateway still requires credentials, so test uses authenticated user.

**Steps**:
1. Call `public_hello` logic as authenticated user
2. Verify greeting response

**Expected**:
- Status: 200
- Response: `{"data": {"data": [{"greeting": "hello"}]}}`

---

### B3: insert_item — Execute-Only Logic
**Purpose**: Verify execute-only logic (INSERT without RETURNING) returns affected count

**Steps**:
1. Call `insert_item` logic with all required parameters
2. Verify response format for execute-only queries
3. Confirm item was inserted via CRUD API

**Expected**:
- Status: 200
- Response: `{"data": {"affected": 1}}`

---

### B4: get_items — Required Parameter Binding
**Purpose**: Verify required parameter validation and SQL injection safety

**Steps**:
1. Call `get_items` with `owner_id` parameter
2. Verify WHERE clause filtering works correctly
3. Confirm empty result set when no matching rows

**Expected**:
- Status: 200
- Response: `{"data": {"data": []}}` (empty initially)

---

### B5: default_params — Default Parameter Values
**Purpose**: Verify default parameter behavior (full defaults, partial override, full override)

**Steps**:
1. Call with no parameters → both defaults applied
2. Call with `greeting` only → `count` defaults to 1
3. Call with both parameters → no defaults used

**Expected**:
- All return status 200
- Correct parameter values in each response

---

### B6: admin_only — Role-Based Access Control
**Purpose**: Verify role restrictions on logic execution

**Steps**:
1. Call `admin_only` as end user (role: `user`) → 403
2. Call `admin_only` as API key (role: `admin`) → 200

**Expected**:
- End user: 403 Forbidden
- API key: 200 with count result

---

### B7: Error Cases
**Purpose**: Verify proper error handling for common failure scenarios

**Test Cases**:
1. **Missing required parameter**: Call `get_items` without `owner_id` → 400
2. **Logic not found**: Call non-existent logic → 404
3. **Unauthenticated**: Call without credentials → 401
4. **Invalid parameter type**: Call `get_items` with numeric `owner_id` → 400

**Expected Error Messages**:
- `"Missing required param: owner_id"`
- `"Logic not found: nonexistent"`
- `"Insufficient roles"` (for role mismatch)
- `"Invalid type for param: owner_id"` (for type mismatch)

## Implementation Notes

### Response Formats
- **Row-returning queries**: `{"data": {"data": [...]}}`
- **Execute-only queries**: `{"data": {"affected": N}}`

### Authentication & Authorization
- End user default role: `["user"]` (hub/src/main.rs:2241)
- API key role: Set via CLI `--roles admin`
- `auth: public` still requires credentials (Bridge gateway enforces authentication first)

### Parameter Resolution
1. Check required parameters present
2. Apply default values for missing optional parameters
3. Validate parameter types
4. Bind to SQL query

### System Variables
- `:auth.sub`: User ID from JWT claims
- `:auth.role`: User roles array
- Available in all authenticated logics

## References
- Handler: `packages/services/bridge/src/handlers/call.rs:737-806`
- Parser: `packages/services/bridge/src/handlers/call.rs:918-949`
- Auth: `packages/services/bridge/src/handlers/call.rs:951-972`
- Params: `packages/services/bridge/src/handlers/call.rs:974-1010`
