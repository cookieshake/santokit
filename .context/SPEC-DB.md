# Database Schema Specification

## Overview
Santoki의 데이터베이스 스키마 구조입니다. PostgreSQL을 기본으로 하되, 다양한 데이터베이스 시스템과의 호환성을 고려하여 설계되었습니다. Kysely query builder를 사용하여 타입 안전성을 보장합니다.

## Technology Stack
- **Query Builder**: Kysely 0.27.5
- **Primary Database**: PostgreSQL
- **Migration Tool**: Custom migration system (`src/db/migrate.ts`)
- **ID Strategy**: TypeID (타입별 접두사 포함)

---

## Tables

### 1. projects
**Purpose:** 프로젝트 정보 관리

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | TypeID (prefix: `proj`) |
| name | TEXT | NOT NULL | 프로젝트 이름 |
| created_at | TIMESTAMP | DEFAULT now() | 생성 시각 |

**Indexes:**
- Primary Key: `id`

**Relationships:**
- `databases.project_id` → `projects.id` (1:N, CASCADE)
- `collections.project_id` → `projects.id` (1:N, CASCADE)
- `policies.project_id` → `projects.id` (1:N, CASCADE)

**Notes:**
- 시스템 프로젝트 (`name = 'system'`)는 삭제 불가
- 프로젝트 삭제 시 관련 데이터베이스, 컬렉션, 정책 자동 삭제 (CASCADE)

---

### 2. databases
**Purpose:** 데이터베이스 연결 정보 관리

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | TypeID (prefix: `db`) |
| project_id | TEXT | FOREIGN KEY, NOT NULL | 소속 프로젝트 ID |
| name | TEXT | NOT NULL | 데이터베이스 이름 |
| connection_string | TEXT | NOT NULL | 연결 문자열 (PostgreSQL URL) |
| prefix | TEXT | NOT NULL, DEFAULT 'santoki_' | 테이블 접두사 |
| created_at | TIMESTAMP | DEFAULT now() | 생성 시각 |

**Indexes:**
- Primary Key: `id`
- `idx_databases_project_id` on `project_id` - 프로젝트별 데이터베이스 조회 최적화

**Constraints:**
- UNIQUE: `(project_id, name)` - 프로젝트 내 데이터베이스 이름 중복 방지
- FOREIGN KEY: `project_id` REFERENCES `projects(id)` ON DELETE CASCADE

**Relationships:**
- `project_id` → `projects.id` (N:1)
- `collections.database_id` → `databases.id` (1:N, CASCADE)
- `policies.database_id` → `databases.id` (1:N, CASCADE)

**Notes:**
- `connection_string`은 암호화되지 않음 (향후 개선 필요)
- `prefix`는 물리적 테이블 이름 생성 시 사용 (예: `santoki_users`)

---

### 3. collections
**Purpose:** 컬렉션(테이블) 메타데이터 관리

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | TypeID (prefix: `col`) |
| project_id | TEXT | FOREIGN KEY, NOT NULL | 소속 프로젝트 ID |
| database_id | TEXT | FOREIGN KEY, NOT NULL | 소속 데이터베이스 ID |
| name | TEXT | NOT NULL | 논리적 컬렉션 이름 |
| physical_name | TEXT | NOT NULL, UNIQUE | 물리적 테이블 이름 (prefix 포함) |
| type | TEXT | NOT NULL, DEFAULT 'base' | 컬렉션 타입 ('base' 또는 'auth') |
| created_at | TIMESTAMP | DEFAULT now() | 생성 시각 |
| updated_at | TIMESTAMP | DEFAULT now() | 수정 시각 |

**Indexes:**
- Primary Key: `id`
- `idx_collections_database_id` on `database_id` - 데이터베이스별 컬렉션 조회 최적화
- `idx_collections_database_name` on `(database_id, name)` - 컬렉션 이름 검색 최적화

**Constraints:**
- UNIQUE: `physical_name` - 물리적 테이블 이름 중복 방지
- FOREIGN KEY: `project_id` REFERENCES `projects(id)` ON DELETE CASCADE
- FOREIGN KEY: `database_id` REFERENCES `databases(id)` ON DELETE CASCADE

**Relationships:**
- `project_id` → `projects.id` (N:1)
- `database_id` → `databases.id` (N:1)

**Collection Types:**
- `base`: 일반 데이터 컬렉션
- `auth`: 계정 관리용 컬렉션 (프로젝트당 1개)

**Notes:**
- `name`: 사용자가 지정한 논리적 이름 (예: `users`)
- `physical_name`: 실제 DB 테이블 이름 (예: `santoki_users`)
- 컬렉션 삭제 시 물리적 테이블도 함께 삭제

---

### 4. accounts
**Purpose:** 사용자 계정 관리 (시스템 관리자 및 프로젝트 사용자)

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | TypeID (prefix: `sys` 또는 `usr`) |
| name | TEXT | | 사용자 이름 |
| email | TEXT | NOT NULL, UNIQUE | 이메일 주소 (로그인 ID) |
| password | TEXT | NOT NULL | 해시된 비밀번호 |
| roles | TEXT[] | | 역할 배열 (예: ['admin', 'user']) |
| project_id | TEXT | | 소속 프로젝트 ID (NULL = 시스템 관리자) |
| created_at | TIMESTAMP | DEFAULT now() | 생성 시각 |
| updated_at | TIMESTAMP | DEFAULT now() | 수정 시각 |

**Indexes:**
- Primary Key: `id`
- UNIQUE: `email` - 이메일 중복 방지 및 조회 최적화

**Account Types:**
- **System Admin**: `project_id = NULL`, TypeID prefix `sys`
- **Project User**: `project_id != NULL`, TypeID prefix `usr`

**Notes:**
- 시스템 관리자는 메인 DB의 `accounts` 테이블에 저장
- 프로젝트 사용자는 각 프로젝트 DB의 auth 컬렉션에 저장
- `project_id`는 외래키 제약 없음 (설계상 의도적)
- 비밀번호는 bcrypt 등으로 해시 후 저장 (평문 저장 금지)

---

### 5. policies
**Purpose:** ABAC (Attribute-Based Access Control) 정책 관리

**Columns:**
| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| id | TEXT | PRIMARY KEY | TypeID (prefix: `pol`) |
| project_id | TEXT | FOREIGN KEY, NOT NULL | 소속 프로젝트 ID |
| database_id | TEXT | FOREIGN KEY, NOT NULL | 소속 데이터베이스 ID |
| collection_name | TEXT | NOT NULL | 대상 컬렉션 이름 |
| role | TEXT | NOT NULL | 대상 역할 (예: 'user', 'admin') |
| action | TEXT | NOT NULL | 허용/거부할 액션 ('create', 'read', 'update', 'delete') |
| condition | TEXT | NOT NULL | JSON 형식의 조건 (예: `{"owner_id": "$user.id"}`) |
| effect | TEXT | NOT NULL, DEFAULT 'allow' | 정책 효과 ('allow' 또는 'deny') |
| created_at | TIMESTAMP | DEFAULT now() | 생성 시각 |

**Indexes:**
- Primary Key: `id`
- `idx_policies_project_database` on `(project_id, database_id)` - 정책 목록 조회 최적화
- `idx_policies_lookup` on `(project_id, database_id, collection_name, action)` - **ABAC 평가 최적화 (중요)**

**Constraints:**
- FOREIGN KEY: `project_id` REFERENCES `projects(id)` ON DELETE CASCADE
- FOREIGN KEY: `database_id` REFERENCES `databases(id)` ON DELETE CASCADE

**Policy Actions:**
- `create`: 데이터 생성 권한
- `read`: 데이터 조회 권한
- `update`: 데이터 수정 권한
- `delete`: 데이터 삭제 권한

**Policy Effects:**
- `allow`: 조건 만족 시 허용
- `deny`: 조건 만족 시 거부 (우선순위 높음)

**Condition Format:**
```json
{
  "column_name": "value",
  "owner_id": "$user.id",
  "status": "active"
}
```

**Condition Variables:**
- `$user.id`: 현재 사용자 ID
- `$user.email`: 현재 사용자 이메일
- `$user.*`: 사용자 객체의 모든 속성

**Evaluation Logic:**
1. Admin 역할은 모든 정책 우회
2. 사용자 역할에 해당하는 정책 검색
3. `deny` 효과가 있으면 즉시 거부
4. `allow` 조건들을 OR로 결합
5. 조건 없음 (`{}`) = 무조건 허용/거부

**Notes:**
- `idx_policies_lookup` 인덱스는 모든 데이터 접근 시 사용되므로 성능에 매우 중요
- 정책이 없으면 기본적으로 거부 (Deny by Default)
- 여러 정책이 매칭되면 OR 조건으로 결합

---

## Migrations

### Migration Files
**Location:** `src/db/migrations/`

**Naming Convention:** `YYYY_MM_DD_description.ts`

**Existing Migrations:**
1. `2026_01_17_initial_schema.ts` - 초기 스키마 생성
2. `2026_01_19_add_indexes.ts` - 성능 최적화 인덱스 추가

**Migration Structure:**
```typescript
import { Kysely, sql } from 'kysely'

export async function up(db: Kysely<any>): Promise<void> {
  // 마이그레이션 로직
}

export async function down(db: Kysely<any>): Promise<void> {
  // 롤백 로직
}
```

**Running Migrations:**
```bash
npm run db:migrate
```

---

## Database Architecture

### Multi-Tenancy Strategy
Santoki는 **Database-per-Tenant** 전략을 사용합니다:

1. **Main Database (System DB)**
   - 프로젝트, 데이터베이스, 컬렉션 메타데이터 저장
   - 시스템 관리자 계정 저장
   - 정책 정보 저장

2. **Tenant Databases (Project DBs)**
   - 각 프로젝트의 실제 데이터 저장
   - 동적으로 생성된 컬렉션(테이블) 포함
   - 프로젝트별 사용자 계정 저장 (auth 컬렉션)

### Connection Management
**File:** `src/db/connection-manager.ts`

**Features:**
- 데이터베이스 연결 풀링
- 연결 재사용
- 자동 연결 해제

**Usage:**
```typescript
const db = await connectionManager.getConnection(databaseId)
```

---

## TypeID Strategy

### Prefixes
| Entity | Prefix | Example |
|--------|--------|---------|
| Project | `proj` | `proj_01h2xcejqtf2nbrexx3vqjhp41` |
| Database | `db` | `db_01h2xcejqtf2nbrexx3vqjhp42` |
| Collection | `col` | `col_01h2xcejqtf2nbrexx3vqjhp43` |
| Policy | `pol` | `pol_01h2xcejqtf2nbrexx3vqjhp44` |
| System Account | `sys` | `sys_01h2xcejqtf2nbrexx3vqjhp45` |
| User Account | `usr` | `usr_01h2xcejqtf2nbrexx3vqjhp46` |

**Benefits:**
- 타입 안전성 (ID만으로 엔티티 타입 식별)
- 시간순 정렬 가능 (타임스탬프 포함)
- URL 안전 (Base32 인코딩)
- 충돌 방지 (UUID v7 기반)

**Library:** `typeid-js` 1.2.0

---

## Query Patterns

### Common Queries

#### 1. 프로젝트별 데이터베이스 조회
```typescript
// Optimized by idx_databases_project_id
db.selectFrom('databases')
  .where('project_id', '=', projectId)
  .execute()
```

#### 2. 데이터베이스별 컬렉션 조회
```typescript
// Optimized by idx_collections_database_id
db.selectFrom('collections')
  .where('database_id', '=', databaseId)
  .execute()
```

#### 3. 컬렉션 이름으로 검색
```typescript
// Optimized by idx_collections_database_name
db.selectFrom('collections')
  .where('database_id', '=', databaseId)
  .where('name', '=', collectionName)
  .executeTakeFirst()
```

#### 4. ABAC 정책 평가 (고빈도)
```typescript
// Optimized by idx_policies_lookup
db.selectFrom('policies')
  .where('project_id', '=', projectId)
  .where('database_id', '=', databaseId)
  .where('collection_name', '=', collectionName)
  .where('action', '=', action)
  .execute()
```

---

## Performance Considerations

### Indexes
모든 인덱스는 실제 쿼리 패턴 분석을 기반으로 설계되었습니다:

1. **Foreign Key Indexes**: 조인 성능 향상
2. **Composite Indexes**: 복합 조건 쿼리 최적화
3. **ABAC Index**: 접근 제어 평가 속도 향상 (가장 중요)

### Query Optimization
- Kysely query builder 사용으로 타입 안전성 보장
- Parameterized queries로 SQL injection 방지
- Connection pooling으로 연결 오버헤드 감소

---

## Security

### SQL Injection Prevention
- ✅ Kysely query builder 사용 (parameterized queries)
- ✅ Zod 스키마로 입력 검증
- ⚠️ 일부 동적 쿼리는 raw SQL 사용 (주의 필요)

### Password Security
- ✅ 비밀번호 해시 저장 (평문 저장 금지)
- ✅ PASETO v3 토큰 사용
- ⚠️ Connection string 평문 저장 (암호화 필요)

### Access Control
- ✅ ABAC 정책 기반 접근 제어
- ✅ 역할 기반 권한 관리
- ✅ 프로젝트 격리 (Database-per-Tenant)

---

## Database Compatibility

### Supported Databases
- **PostgreSQL** (Primary, Tested)
- **SQLite** (Planned)
- **MySQL** (Planned)

### Compatibility Considerations
- Kysely를 통한 추상화 레이어
- 데이터베이스별 어댑터 패턴 사용
- 표준 SQL 타입 사용 (TEXT, INTEGER, TIMESTAMP)

### PostgreSQL-Specific Features
- `TEXT[]` 배열 타입 (accounts.roles)
- `gen_random_uuid()` 함수
- `information_schema` 테이블

---

## Future Enhancements

### Planned Features
- [ ] Connection string 암호화
- [ ] 데이터베이스 백업/복원
- [ ] 마이그레이션 버전 관리 개선
- [ ] 감사 로그 (Audit Log) 테이블
- [ ] 소프트 삭제 (Soft Delete) 지원

### Performance Improvements
- [ ] 쿼리 캐싱
- [ ] 읽기 전용 복제본 지원
- [ ] 파티셔닝 전략
- [ ] 인덱스 사용률 모니터링

---

## File Structure

```
src/db/
├── index.ts                    # 메인 DB 연결
├── connection-manager.ts       # 테넌트 DB 연결 관리
├── migrate.ts                  # 마이그레이션 실행
└── migrations/
    ├── 2026_01_17_initial_schema.ts
    └── 2026_01_19_add_indexes.ts
```

---

## Design Principles

1. **타입 안전성**: TypeID와 Kysely로 타입 보장
2. **확장성**: Multi-tenancy로 프로젝트 격리
3. **성능**: 쿼리 패턴 기반 인덱스 설계
4. **보안**: ABAC 정책과 입력 검증
5. **호환성**: 다양한 DB 시스템 지원 고려
