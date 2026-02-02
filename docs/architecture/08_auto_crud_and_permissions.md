# 08. Auto CRUD & Permissions (Spec)

## 존재 의의
스키마만 정의하면 자동으로 CRUD API를 생성하고, 컬럼 prefix 기반으로 권한을 자동 적용하여 개발자 경험을 극대화한다.

## 상태 표기
- ✅ 구현됨
- 🟡 부분 구현
- ❌ 미구현

---

## 자동 CRUD API

### `POST /call` (자동 CRUD)
- **존재 의의**: 스키마 기반 자동 CRUD 제공
- **행동**: `_crud/{table}/{operation}` 패턴으로 기본 CRUD 실행
- **동작**:
  1. `config/permissions.yaml` 및 컬럼 prefix에서 권한 확인
  2. 스키마 기반 쿼리 생성
  3. Row-Level Security (RLS) 필터 적용
  4. SQL 실행 및 결과 반환
- **오버라이드**: `logic/{table}/{operation}.sql`이 있으면 커스텀 로직 우선
- **상태**: ❌

### 지원 Operation

#### `_crud/{table}/select`
```yaml
# 요청 예시
path: "_crud/users/select"
params:
  where: { status: "active" }
  select: ["id", "name", "s_email"]
  orderBy: { created_at: "desc" }
  limit: 10
  offset: 0
```

#### `_crud/{table}/insert`
```yaml
# 요청 예시
path: "_crud/users/insert"
params:
  data:
    name: "John Doe"
    s_email: "john@example.com"
```

#### `_crud/{table}/update`
```yaml
# 요청 예시
path: "_crud/users/update"
params:
  where: { id: "uuid-123" }
  data:
    name: "Jane Doe"
```

#### `_crud/{table}/delete`
```yaml
# 요청 예시
path: "_crud/users/delete"
params:
  where: { id: "uuid-123" }
```

---

## 컬럼 Prefix 규칙

### 존재 의의
컬럼 이름의 prefix로 민감도와 권한을 자동 설정하여 보안을 강화하고 개발자 실수를 방지한다.

### Prefix 정의

#### `s_` (Sensitive)
- **의미**: 민감한 개인정보
- **기본 권한**:
  - `select`: `[owner, admin]`
  - `update`: `[owner, admin]`
- **예시**: `s_email`, `s_phone`, `s_address`
- **동작**: 일반 `SELECT *`에 포함되지만 owner/admin만 조회 가능

#### `c_` (Critical)
- **의미**: 극비 정보, 높은 보안 필요
- **기본 권한**:
  - `select`: `[admin]`
  - `update`: `[admin]`
- **특수 동작**:
  - `SELECT *` 시 자동 제외
  - 모든 접근 감사 로그 기록
- **예시**: `c_password_hash`, `c_ssn`, `c_credit_card`

#### `p_` (Private)
- **의미**: 내부 전용, 외부 노출 금지
- **기본 권한**:
  - `select`: `[admin]`
  - `update`: `[admin]`
- **특수 동작**: `SELECT *` 시 자동 제외
- **예시**: `p_internal_notes`, `p_admin_flags`, `p_ban_reason`

#### `_` (System)
- **의미**: 시스템 관리 컬럼, 읽기 전용
- **기본 권한**:
  - `select`: `[authenticated]`
  - `update`: `[]` (수정 불가)
  - `insert`: `[]` (자동 생성)
- **예시**: `_created_at`, `_updated_at`, `_version`

### 스키마 예시

```hcl
# schema/main.hcl
table "users" {
  schema = schema.public
  
  # 일반 컬럼 (prefix 없음)
  column "id" {
    type = uuid
    default = sql("gen_random_uuid()")
  }
  
  column "name" {
    type = varchar(255)
  }
  
  # Sensitive 컬럼
  column "s_email" {
    type = varchar(255)
    null = false
  }
  
  column "s_phone" {
    type = varchar(20)
  }
  
  # Critical 컬럼
  column "c_password_hash" {
    type = text
    null = false
  }
  
  column "c_ssn" {
    type = varchar(11)
  }
  
  # Private 컬럼
  column "p_ban_reason" {
    type = text
  }
  
  column "p_internal_score" {
    type = integer
  }
  
  # System 컬럼
  column "_created_at" {
    type = timestamptz
    default = sql("now()")
  }
  
  column "_updated_at" {
    type = timestamptz
    default = sql("now()")
  }
  
  primary_key {
    columns = [column.id]
  }
}
```

---

## 권한 제어

### Level 1: 테이블 레벨 권한

```yaml
# config/permissions.yaml
tables:
  users:
    select: [authenticated]
    insert: [public]        # 회원가입은 누구나
    update: [owner, admin]
    delete: [admin]
  
  orders:
    select: [owner, admin]
    insert: [authenticated]
    update: [owner, admin]
    delete: [owner, admin]
  
  # 기본 정책 (테이블별 설정 없으면 적용)
  _default:
    select: [authenticated]
    insert: [authenticated]
    update: [owner, admin]
    delete: [admin]
```

### Level 2: 컬럼 레벨 권한

```yaml
# config/permissions.yaml
tables:
  users:
    select: [authenticated]
    insert: [public]
    update: [owner, admin]
    delete: [admin]
    
    # 컬럼별 세부 권한 (prefix 기본값 오버라이드)
    columns:
      s_email:
        select: [owner, admin]
        update: [admin]       # 이메일 변경은 admin만
      
      c_password_hash:
        select: []            # 아무도 조회 불가
        update: []            # 특수 로직으로만 변경
```

### Level 3: Row-Level Security (RLS)

#### Owner 판별 설정

```yaml
# config/permissions.yaml
ownerColumn:
  _default: user_id         # 기본값
  users: id                 # users 테이블은 id가 owner
  posts: author_id          # posts 테이블은 author_id가 owner
  comments: user_id
```

#### RLS 동작 예시

```typescript
// 일반 유저가 주문 조회
await stk.call('_crud/orders/select', {
  where: { status: 'pending' }
});

// Server 내부 처리:
// 1. 권한 체크: orders.select = ['owner', 'admin']
// 2. user.roles = ['user'] → owner 규칙 적용
// 3. RLS 필터 추가: { user_id: user.id }
// 4. 최종 쿼리:
SELECT * FROM orders 
WHERE status = 'pending' 
  AND user_id = 'current-user-id'  -- 자동 추가!

// Admin은 모든 주문 조회
// user.roles = ['admin'] → RLS 필터 없음
SELECT * FROM orders 
WHERE status = 'pending'
```

---

## 권한 키워드

### `public`
- 인증 불필요, 누구나 접근 가능
- 예시: 공개 게시물 조회, 회원가입

### `authenticated`
- 로그인한 사용자만 접근 가능
- JWT/PASETO 토큰 필요

### `owner`
- 본인 데이터만 접근 가능
- `ownerColumn` 설정 기반 RLS 적용
- Admin은 owner 체크 우회

### `{role}` (예: `admin`, `user`, `guest`)
- 특정 역할을 가진 사용자만 접근 가능
- `config/auth.yaml`의 `roles` 정의 참조

---

## SELECT * 동작

### 기본 동작
```typescript
// 요청
await stk.call('_crud/users/select', {
  where: { id: 1 }
});

// 일반 유저 결과 (c_, p_ 컬럼 자동 제외)
{
  id: "uuid-123",
  name: "John",
  s_email: "john@example.com",  // owner이므로 포함
  s_phone: "010-1234-5678",
  _created_at: "2026-01-01T00:00:00Z",
  _updated_at: "2026-02-02T17:43:00Z"
  // c_password_hash, c_ssn, p_ban_reason 제외됨
}

// Admin 결과 (모든 컬럼 포함)
{
  id: "uuid-123",
  name: "John",
  s_email: "john@example.com",
  s_phone: "010-1234-5678",
  c_password_hash: "$2b$10$...",
  c_ssn: "123-45-6789",
  p_ban_reason: null,
  p_internal_score: 95,
  _created_at: "2026-01-01T00:00:00Z",
  _updated_at: "2026-02-02T17:43:00Z"
}
```

### 명시적 컬럼 선택
```typescript
// c_, p_ 컬럼을 명시적으로 요청
await stk.call('_crud/users/select', {
  where: { id: 1 },
  select: ['id', 'name', 'c_ssn']  // c_ssn 요청
});

// 권한 없으면 에러
// Error: Permission denied for column: c_ssn
```

---

## 커스텀 로직 오버라이드

### 우선순위
1. **커스텀 로직**: `logic/{table}/{operation}.sql` 또는 `.js`
2. **자동 CRUD**: `_crud/{table}/{operation}`

### 예시

```
logic/
├── users/
│   ├── select.sql        # 커스텀 로직 (자동 CRUD 오버라이드)
│   ├── getWithPosts.sql  # 추가 커스텀 로직
│   └── updateProfile.js  # 복잡한 비즈니스 로직
└── orders/
    # 커스텀 로직 없음 → 자동 CRUD 사용
```

```sql
-- logic/users/select.sql
-- 커스텀 로직으로 자동 CRUD 오버라이드
SELECT 
  u.id,
  u.name,
  u.s_email,
  COUNT(p.id) as post_count
FROM users u
LEFT JOIN posts p ON p.author_id = u.id
WHERE u.id = :id
GROUP BY u.id, u.name, u.s_email;
```

```typescript
// 호출
await stk.call('users/select', { id: 1 });
// → logic/users/select.sql 실행 (자동 CRUD 무시)

await stk.call('orders/select', { id: 1 });
// → _crud/orders/select 실행 (커스텀 로직 없음)
```

---

## 감사 로그

### 자동 로깅 대상
- `c_` prefix 컬럼 접근 (조회/수정)
- `p_` prefix 컬럼 접근
- `delete` operation

### 로그 스키마

```hcl
table "audit_logs" {
  schema = schema.public
  
  column "id" {
    type = uuid
    default = sql("gen_random_uuid()")
  }
  
  column "user_id" {
    type = uuid
  }
  
  column "action" {
    type = varchar(50)  # select, insert, update, delete
  }
  
  column "table_name" {
    type = varchar(255)
  }
  
  column "column_name" {
    type = varchar(255)
    null = true
  }
  
  column "row_id" {
    type = uuid
    null = true
  }
  
  column "ip_address" {
    type = varchar(45)
  }
  
  column "user_agent" {
    type = text
  }
  
  column "_created_at" {
    type = timestamptz
    default = sql("now()")
  }
}
```

---

## 구현 상태

| 기능 | 상태 | 비고 |
|------|------|------|
| 자동 CRUD API | ❌ | 미구현 |
| 컬럼 prefix 파싱 | ❌ | 미구현 |
| 테이블 레벨 권한 | ❌ | 미구현 |
| 컬럼 레벨 권한 | ❌ | 미구현 |
| Row-Level Security | ❌ | 미구현 |
| SELECT * 필터링 | ❌ | 미구현 |
| 커스텀 로직 오버라이드 | ❌ | 미구현 |
| 감사 로그 | ❌ | 미구현 |

---

## 참고 문서
- [05. Server and Edge](./05_server_and_edge.md)
- [07. Security and Secrets](./07_security_and_secrets.md)
