# Project API Specification

## Overview
프로젝트 및 데이터베이스 관리를 위한 REST API입니다. 프로젝트 생성, 조회, 삭제 및 프로젝트별 데이터베이스 관리 기능을 제공합니다.

## Base Path
```
/v1/projects
```

## Authentication
- 모든 엔드포인트는 인증이 필요합니다
- `project_id`는 헤더를 통해 제공됩니다 (상수: `constants.ts` 참조)

---

## Endpoints

### 1. Create Project
프로젝트를 생성합니다.

**Endpoint:** `POST /v1/projects`

**Request Headers:**
- `Content-Type: application/json`

**Request Body:**
```typescript
{
  name: string  // 최소 1자 이상
}
```

**Validation:**
- `name`: 필수, 최소 1자 이상의 문자열

**Response (200):**
```typescript
{
  id: string,           // TypeID 형식 (proj_xxxxx)
  name: string,
  created_at: string    // ISO 8601 timestamp
}
```

**Behavior:**
- 새로운 프로젝트를 생성합니다
- 프로젝트 ID는 자동으로 TypeID 형식으로 생성됩니다 (`proj_` 접두사)

**Constraints:**
- 프로젝트 이름은 중복 가능합니다

---

### 2. List Projects
모든 프로젝트 목록을 조회합니다.

**Endpoint:** `GET /v1/projects`

**Request Headers:**
없음

**Request Body:**
없음

**Response (200):**
```typescript
[
  {
    id: string,
    name: string,
    created_at: string
  },
  ...
]
```

**Behavior:**
- 시스템에 등록된 모든 프로젝트를 반환합니다
- 결과는 배열 형태로 반환됩니다

**Constraints:**
- 빈 배열이 반환될 수 있습니다

---

### 3. Delete Project
프로젝트를 삭제합니다.

**Endpoint:** `DELETE /v1/projects/:id`

**URL Parameters:**
- `id` (string): 프로젝트 ID

**Query Parameters:**
- `deleteData` (boolean, optional): `true`로 설정 시 연관된 모든 데이터(테이블) 삭제
  - 기본값: `false`

**Request Headers:**
없음

**Request Body:**
없음

**Response (200):**
```typescript
{
  success: true
}
```

**Response (400):**
```typescript
{
  error: string  // 에러 메시지
}
```

**Behavior:**
1. 프로젝트 존재 여부 확인
2. `deleteData=true`인 경우:
   - 프로젝트에 속한 모든 데이터베이스 조회
   - 각 데이터베이스의 모든 컬렉션 조회
   - 모든 물리적 테이블 삭제
3. 프로젝트 메타데이터 삭제 (CASCADE로 연관 데이터 자동 삭제)

**Constraints:**
- 존재하지 않는 프로젝트 ID인 경우 에러 반환
- `deleteData=false`인 경우 메타데이터만 삭제되고 실제 테이블은 유지됩니다

**Error Cases:**
- 프로젝트를 찾을 수 없음: `"Project not found"`

---

### 4. Create Database
프로젝트에 데이터베이스를 추가합니다.

**Endpoint:** `POST /v1/projects/:id/databases`

**URL Parameters:**
- `id` (string): 프로젝트 ID

**Request Headers:**
- `Content-Type: application/json`

**Request Body:**
```typescript
{
  name: string,              // 영문자, 숫자, 언더스코어만 허용, 최소 1자
  connectionString: string,  // 유효한 URL 형식
  prefix?: string            // 기본값: "santoki_"
}
```

**Validation:**
- `name`: 필수, 정규식 `/^[a-zA-Z0-9_]+$/` 매칭 필요
- `connectionString`: 필수, 유효한 URL 형식
- `prefix`: 선택, 기본값 `"santoki_"`

**Response (200):**
```typescript
{
  id: string,                // TypeID 형식 (db_xxxxx)
  project_id: string,
  name: string,
  connection_string: string,
  prefix: string,
  created_at: string
}
```

**Response (400):**
```typescript
{
  error: string  // 에러 메시지
}
```

**Behavior:**
1. 데이터베이스 레코드 생성
2. 기본 `users` 컬렉션 자동 생성 (type: 'auth', idType: 'typeid')
3. 데이터베이스 ID는 자동으로 TypeID 형식으로 생성됩니다 (`db_` 접두사)

**Constraints:**
- 같은 프로젝트 내에서 데이터베이스 이름은 고유해야 합니다 (UNIQUE 제약)
- `users` 컬렉션이 이미 존재하는 경우 에러를 무시하고 계속 진행합니다

**Error Cases:**
- 중복된 데이터베이스 이름
- 잘못된 연결 문자열 형식

---

### 5. Delete Database
프로젝트의 데이터베이스를 삭제합니다.

**Endpoint:** `DELETE /v1/projects/:id/databases/:dbId`

**URL Parameters:**
- `id` (string): 프로젝트 ID
- `dbId` (string): 데이터베이스 ID

**Request Headers:**
없음

**Request Body:**
없음

**Response (200):**
```typescript
{
  success: true
}
```

**Response (400):**
```typescript
{
  error: string  // 에러 메시지
}
```

**Behavior:**
1. 데이터베이스 존재 여부 확인
2. 데이터베이스가 해당 프로젝트에 속하는지 검증
3. 데이터베이스의 모든 컬렉션 조회
4. 모든 물리적 테이블 삭제
5. 데이터베이스 메타데이터 삭제 (CASCADE로 연관 데이터 자동 삭제)

**Constraints:**
- 데이터베이스는 반드시 지정된 프로젝트에 속해야 합니다
- 물리적 테이블이 먼저 삭제된 후 메타데이터가 삭제됩니다

**Error Cases:**
- 데이터베이스를 찾을 수 없음: `"Database not found"`
- 프로젝트 불일치: `"Database does not belong to project"`

---

## Nested Routes

### Collections
프로젝트의 컬렉션 관리 API는 다음 경로에 마운트됩니다:
```
/v1/projects/collections
```
자세한 내용은 Collection API 스펙 참조

### Users (Accounts)
프로젝트의 사용자 관리 API는 다음 경로에 마운트됩니다:
```
/v1/projects/users
```
자세한 내용은 Account API 스펙 참조

---

## Database Schema

### projects 테이블
```sql
CREATE TABLE projects (
    id TEXT PRIMARY KEY,           -- TypeID 형식
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

### databases 테이블
```sql
CREATE TABLE databases (
    id TEXT PRIMARY KEY,           -- TypeID 형식
    project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    connection_string TEXT NOT NULL,
    prefix TEXT NOT NULL DEFAULT 'santoki_',
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(project_id, name)
);
```

---

## Common Patterns

### ID 생성
- 모든 ID는 TypeID 형식을 사용합니다
- 프로젝트: `proj_` 접두사
- 데이터베이스: `db_` 접두사

### 에러 처리
- 성공: HTTP 200 + JSON 응답
- 실패: HTTP 400 + `{ error: string }` 형식

### CASCADE 삭제
- 프로젝트 삭제 시 연관된 모든 데이터베이스, 컬렉션, 정책이 자동 삭제됩니다
- 데이터베이스 삭제 시 연관된 모든 컬렉션, 정책이 자동 삭제됩니다

### 데이터베이스 연결
- PostgreSQL을 포함한 다양한 DB 연결을 지원할 수 있도록 설계되었습니다
- `connectionString`은 표준 URL 형식을 따릅니다

---

## Implementation Notes

### Constants
- 헤더 이름 등 공통 변수는 `constants.ts`에 정의되어 사용됩니다
- 하드코딩을 피하고 중앙 집중식 관리를 따릅니다

### Validation
- 입력 검증은 Zod 스키마를 사용합니다 (`validators.ts`)
- `@hono/zod-validator`를 통해 자동 검증 및 타입 안전성 보장

### Service Layer
- 비즈니스 로직은 `project.service.ts`에 구현됩니다
- 데이터베이스 접근은 `project.repository.ts`를 통해 추상화됩니다

### Testing
- E2E 테스트: `project.e2e-spec.ts`
- 단위 테스트: `project.spec.ts`
