# SDK Code Generation Strategy

This document defines the approach for automatically generating client SDKs from Santokit schema and permissions.

---

## 1. Overview

### 1.1 Goals

- **Type Safety:** Client SDKs provide compile-time type checking
- **Automation:** SDKs generated from schema, no manual sync needed
- **Multi-Language:** Support TypeScript, Python, Go, Rust (priority order)
- **Developer Experience:** Autocomplete, inline docs, error handling

### 1.2 Architecture

```
Schema YAML (tables/*.yaml)
  ↓
Intermediate Representation (IR)
  ↓
Code Generator (per language)
  ↓
Client SDK (TypeScript, Python, Go, Rust)
```

---

## 2. Intermediate Representation (IR)

### 2.1 Schema IR

**Purpose:** Language-agnostic representation of schema

**Format:** JSON

**Example:**
```json
{
  "version": "1.0",
  "tables": {
    "users": {
      "columns": [
        {
          "name": "id",
          "type": "uuid",
          "nullable": false,
          "primaryKey": true
        },
        {
          "name": "email",
          "type": "text",
          "nullable": false,
          "unique": true
        },
        {
          "name": "created_at",
          "type": "timestamptz",
          "nullable": false,
          "default": "now()"
        }
      ],
      "foreignKeys": [
        {
          "column": "team_id",
          "references": {
            "table": "teams",
            "column": "id"
          }
        }
      ]
    }
  }
}
```

### 2.2 Permissions IR

**Purpose:** Encode permission rules for client-side type guards

**Format:** JSON

**Example:**
```json
{
  "tables": {
    "users": {
      "select": {
        "roles": ["authenticated"],
        "columns": ["id", "email", "name"]
      },
      "insert": {
        "roles": ["admin"],
        "columns": ["email", "name", "team_id"]
      },
      "update": {
        "roles": ["owner"],
        "columns": ["name", "avatar_url"],
        "condition": "resource.id == auth.userId"
      }
    }
  }
}
```

---

## 3. Code Generation: TypeScript

### 3.1 Type Generation

**From Schema IR:**

```typescript
// Generated: src/types/users.ts

export interface User {
  id: string;           // uuid → string
  email: string;        // text → string
  name: string | null;  // nullable text → string | null
  created_at: Date;     // timestamptz → Date
  team_id: string;      // uuid (FK) → string
}

export interface UserInsertInput {
  id?: string;          // Primary key optional (if auto-generated)
  email: string;
  name?: string | null;
  team_id: string;
}

export interface UserUpdateInput {
  email?: string;
  name?: string | null;
  team_id?: string;
}

export interface UserSelectOptions {
  where?: Partial<User> | WhereClause;
  orderBy?: { [K in keyof User]?: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
  expand?: Array<'team'>;  // FK relationships
}
```

**Type Mapping:**
| PostgreSQL Type | TypeScript Type |
|----------------|----------------|
| `uuid` | `string` |
| `text` | `string` |
| `int`, `bigint` | `number` |
| `boolean` | `boolean` |
| `timestamptz` | `Date` |
| `jsonb` | `Record<string, any>` |
| `text[]` | `string[]` |

---

### 3.2 Client Methods

**Generated SDK Class:**

```typescript
// Generated: src/client.ts

import { SantokitClient } from '@santokit/client-core';
import { User, UserInsertInput, UserUpdateInput, UserSelectOptions } from './types/users';

export class UsersTable {
  constructor(private client: SantokitClient) {}

  async select(options?: UserSelectOptions): Promise<User[]> {
    const response = await this.client.post('/db/users/select', options);
    return response.data.map((row: any) => ({
      ...row,
      created_at: new Date(row.created_at),
    }));
  }

  async insert(data: UserInsertInput): Promise<User> {
    const response = await this.client.post('/db/users/insert', data);
    return {
      ...response.data,
      created_at: new Date(response.data.created_at),
    };
  }

  async update(id: string, data: UserUpdateInput): Promise<User> {
    const response = await this.client.post('/db/users/update', {
      where: { id },
      data,
    });
    return {
      ...response.data,
      created_at: new Date(response.data.created_at),
    };
  }

  async delete(id: string): Promise<void> {
    await this.client.post('/db/users/delete', { where: { id } });
  }
}

// Main SDK class
export class Santokit extends SantokitClient {
  users: UsersTable;
  teams: TeamsTable;
  // ... other tables

  constructor(config: { apiUrl: string; apiKey: string }) {
    super(config);
    this.users = new UsersTable(this);
    this.teams = new TeamsTable(this);
  }
}
```

**Usage:**
```typescript
import { Santokit } from '@myproject/santokit-client';

const client = new Santokit({
  apiUrl: 'https://bridge.example.com',
  apiKey: process.env.STK_API_KEY!,
});

// Type-safe queries
const users = await client.users.select({
  where: { email: 'alice@example.com' },
  expand: ['team'],
});

console.log(users[0].name); // TypeScript knows this is string | null
```

---

### 3.3 Permission-Based Type Guards

**From Permissions IR:**

```typescript
// Generated: src/permissions/users.ts

export type UserSelectableColumns = 'id' | 'email' | 'name';  // Excludes admin-only columns
export type UserInsertableColumns = 'email' | 'name' | 'team_id';
export type UserUpdatableColumns = 'name' | 'avatar_url';

export interface UserSelectInput {
  columns?: UserSelectableColumns[];
  where?: Partial<Pick<User, UserSelectableColumns>>;
}

export interface UserInsertInputPermissioned {
  [K in UserInsertableColumns]: K extends keyof UserInsertInput ? UserInsertInput[K] : never;
}
```

**Prevents compile-time errors:**
```typescript
// ✅ Allowed
await client.users.select({ columns: ['id', 'email'] });

// ❌ Compile error: 'internal_notes' not in UserSelectableColumns
await client.users.select({ columns: ['id', 'internal_notes'] });
```

---

## 4. Code Generation: Python

### 4.1 Type Generation (Pydantic)

**From Schema IR:**

```python
# Generated: santokit_client/types/users.py

from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field
import uuid

class User(BaseModel):
    id: uuid.UUID
    email: str
    name: Optional[str] = None
    created_at: datetime
    team_id: uuid.UUID

    class Config:
        # Allow datetime parsing from ISO strings
        json_encoders = {datetime: lambda v: v.isoformat()}

class UserInsertInput(BaseModel):
    id: Optional[uuid.UUID] = None
    email: str
    name: Optional[str] = None
    team_id: uuid.UUID

class UserUpdateInput(BaseModel):
    email: Optional[str] = None
    name: Optional[str] = None
    team_id: Optional[uuid.UUID] = None
```

---

### 4.2 Client Methods

**Generated SDK Class:**

```python
# Generated: santokit_client/client.py

from typing import List, Optional
from santokit_client.types.users import User, UserInsertInput, UserUpdateInput

class UsersTable:
    def __init__(self, client):
        self.client = client

    async def select(self, where: Optional[dict] = None, limit: Optional[int] = None) -> List[User]:
        response = await self.client.post('/db/users/select', {
            'where': where,
            'limit': limit,
        })
        return [User(**row) for row in response['data']]

    async def insert(self, data: UserInsertInput) -> User:
        response = await self.client.post('/db/users/insert', data.dict(exclude_none=True))
        return User(**response['data'])

class Santokit:
    def __init__(self, api_url: str, api_key: str):
        self.client = SantokitClient(api_url, api_key)
        self.users = UsersTable(self.client)
```

**Usage:**
```python
from santokit_client import Santokit

client = Santokit(
    api_url='https://bridge.example.com',
    api_key=os.environ['STK_API_KEY']
)

users = await client.users.select(where={'email': 'alice@example.com'})
print(users[0].name)  # Type hint: Optional[str]
```

---

## 5. Code Generation Pipeline

### 5.1 Trigger

**When to regenerate SDK:**
- Schema changes (table/column added/removed)
- Permissions changes (column access modified)
- Manual trigger: `stk codegen --lang typescript`

### 5.2 Steps

```bash
# Step 1: Extract schema to IR
stk schema export --format ir --output schema-ir.json

# Step 2: Extract permissions to IR
stk permissions export --format ir --output permissions-ir.json

# Step 3: Generate TypeScript SDK
stk codegen generate \
  --lang typescript \
  --schema schema-ir.json \
  --permissions permissions-ir.json \
  --output ./generated/typescript

# Step 4: Build and publish
cd ./generated/typescript
npm install
npm run build
npm publish --access public
```

---

### 5.3 CI/CD Integration

**Automated SDK Release:**

```yaml
# .github/workflows/codegen.yml

name: Generate and Publish SDK

on:
  push:
    branches: [main]
    paths:
      - 'tables/**'
      - 'permissions.yaml'

jobs:
  codegen:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Install stk CLI
        run: npm install -g @santokit/cli

      - name: Generate TypeScript SDK
        run: |
          stk schema export --format ir --output schema-ir.json
          stk permissions export --format ir --output permissions-ir.json
          stk codegen generate --lang typescript --output ./sdk/typescript

      - name: Publish to NPM
        run: |
          cd ./sdk/typescript
          npm version patch  # Auto-increment version
          npm publish
        env:
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}

      - name: Create Git tag
        run: |
          SDK_VERSION=$(node -p "require('./sdk/typescript/package.json').version")
          git tag "sdk-v${SDK_VERSION}"
          git push origin "sdk-v${SDK_VERSION}"
```

---

## 6. OpenAPI Spec Generation

### 6.1 Bridge API → OpenAPI

**Generate OpenAPI 3.0 spec from Bridge routes:**

```bash
stk api-spec generate --output openapi.yaml
```

**Output:**
```yaml
openapi: 3.0.0
info:
  title: Santokit Bridge API
  version: 2.0.0

paths:
  /db/users/select:
    post:
      summary: Select users
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/UserSelectInput'
      responses:
        '200':
          description: Success
          content:
            application/json:
              schema:
                type: object
                properties:
                  data:
                    type: array
                    items:
                      $ref: '#/components/schemas/User'

components:
  schemas:
    User:
      type: object
      properties:
        id:
          type: string
          format: uuid
        email:
          type: string
          format: email
        name:
          type: string
          nullable: true
```

**Use Cases:**
- Generate SDKs with OpenAPI Generator (Go, Java, etc.)
- API documentation (Swagger UI)
- Contract testing (Pact)

---

## 7. Versioning & Distribution

### 7.1 SDK Versioning

**SDK version tied to schema version:**
```
Schema v2.1 → SDK v2.1.0
Schema v2.2 → SDK v2.2.0
```

**NPM Package:**
```json
{
  "name": "@myproject/santokit-client",
  "version": "2.1.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts"
}
```

**PyPI Package:**
```toml
[project]
name = "myproject-santokit-client"
version = "2.1.0"
```

---

### 7.2 Multi-Tenant SDK Distribution

**Option 1: Per-Project Packages**
- Each project publishes its own SDK
- NPM: `@myproject/santokit-client`
- PyPI: `myproject-santokit-client`

**Option 2: Monorepo with Scopes**
- Single repo, multiple packages
- NPM: `@santokit-clients/myproject`
- PyPI: `santokit-clients-myproject`

---

## 8. Custom Logic Integration

### 8.1 Type Generation for Custom Logic

**From `logics/purchase.yaml`:**
```yaml
name: purchase
input:
  product_id: uuid
  quantity: int
output:
  new_balance: float
  new_stock: int
```

**Generated TypeScript:**
```typescript
export interface PurchaseInput {
  product_id: string;
  quantity: number;
}

export interface PurchaseOutput {
  new_balance: number;
  new_stock: number;
}

class LogicsClient {
  async purchase(input: PurchaseInput): Promise<PurchaseOutput> {
    const response = await this.client.post('/logic/purchase', input);
    return response.data;
  }
}
```

---

## 9. Related Documents

- **`plan/spec/schema.md`** — Schema definition
- **`plan/spec/client-sdk.md`** — SDK design principles
- **`plan/spec/crud.md`** — CRUD operations
- **`plan/implement/testing.md`** — SDK testing strategy

---

## Summary

**Code Generation Goals:**
1. **Zero Manual Sync** — Schema changes auto-generate SDK
2. **Type Safety** — Compile-time checks prevent runtime errors
3. **Multi-Language** — TypeScript, Python, Go, Rust support
4. **CI/CD Integration** — Automated SDK release on schema change
5. **Versioned** — SDK version tracks schema version

**Golden Rule:** Generated code should feel hand-written. Optimize for developer experience, not generator simplicity.
