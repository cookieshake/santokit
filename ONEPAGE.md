# Santokit Spec v5

AI-native self-hosted BaaS. 단일 바이너리 (Rust).
YAML로 앱의 도메인을 기술하면 백엔드가 나온다. DB 스키마는 자동 유도.
차별점: GUI 없이 파일만으로 백엔드 정의 → AI가 생성/수정 가능.

## 기술 스택

- **언어**: Rust (단일 바이너리, 저메모리, GC 없음)
- **HTTP**: axum
- **DB**: SeaORM (SQLite 기본 / Postgres 옵션)
- **액션 런타임**: QuickJS (경량 JS 엔진 내장)
- **인증**: PASETO v4.local

## 시작

```bash
santokit init                              # ./santokit/ 디렉토리 + 예제 YAML 생성
santokit apply                             # YAML → DB 스키마 적용 + 타입 생성
santokit serve                             # 서버 시작 (기본: SQLite + 포트 8090)

# 또는 Postgres 사용
santokit serve --db "postgres://user:pass@host/db"

# docker-compose
docker compose up
```

→ API: `http://localhost:8090/api`
→ 대시보드: `http://localhost:8090/_admin`

## 데이터베이스

```yaml
# santokit.yaml (선택)
database: "sqlite://./data.db"              # 기본값 — 파일 하나, 비용 제로
# database: "postgres://user:pass@host/db"  # HA/스케일 필요 시
```

- **SQLite** (기본) — 내장, 설정 불필요, 128MB 장비에서도 동작
- **Postgres** (옵션) — HA, 동시성, 스케일이 필요할 때. Postgres 호환 DB(CockroachDB, Neon 등)도 사용 가능

SeaORM 기반으로 드라이버만 교체. 앱 코드/YAML 변경 없이 전환 가능.

## 배포

단일 바이너리이므로 어디서든 동작.

```
# 직접 실행
./santokit serve

# Docker
docker run -v ./santokit:/app/santokit santokit serve

# Cloudflare Containers ($5~/월, scale-to-zero, 글로벌 엣지)
# Fly.io ($3~/월, SQLite 볼륨 지원)
# 아무 VPS ($5~/월)
```

최소 사양: 128MB RAM, 1 vCPU.

## 설정 디렉토리

```
santokit/
  resources.yaml      # 리소스, 필드, 권한 정의
  auth.yaml           # 인증 설정
  storage.yaml        # 파일 저장소 설정
  actions/            # 액션 로직 (JS)
    posts/
      publish.js
      reject.js
  types/              # 자동 생성 (santokit apply 시)
    santokit.d.ts
  jsconfig.json       # 자동 생성
```

기본: `./santokit/` 탐색. `--config ./path/`로 변경 가능.

## 리소스 (`resources.yaml`)

리소스 이름이 곧 API 경로와 DB 테이블명. 자동 변환 없음.

```yaml
version: 1
resources:
  users:                                     # 예약 리소스 — 인증 시스템과 자동 연결
    fields:                                  # email, password_hash, roles는 자동 포함
      name: { type: string, optional: true }

  posts:
    fields:
      title: string
      body: text
      published: { type: boolean, default: false }
    belongs_to:
      author: users
    access:
      list: [anyone]
      get: [anyone]
      create: [authenticated]
      update: [author, admin]
      delete: [author, admin]
    actions: [publish, unpublish]

  comments:
    fields:
      body: text
    belongs_to:
      post: posts
      author: users

  post_likes:
    belongs_to:
      post: posts
      user: users
    unique: [post, user]
```

### `users` 예약 리소스

`users`라는 이름의 리소스는 인증 시스템과 자동 연결. 다음 필드가 자동 포함됨:
- `email` — unique, 로그인 식별자
- `password_hash` — 내부 관리, API 노출 안 됨
- `roles` — 역할 목록 (기본: `["authenticated"]`)

사용자는 추가 필드만 정의하면 됨 (`name`, `avatar` 등).
`users` 리소스가 없으면 인증 시스템은 내부 테이블로 독립 동작.

### 필드 타입

`string`, `text`, `int`, `bigint`, `float`, `decimal(p,s)`, `boolean`, `json`, `timestamp`, `string[]`, `int[]`.

축약: `title: string`은 `title: { type: string }`과 동일.

### 자동 생성 필드

모든 리소스에 자동 포함 (명시 불필요):
- `id` — ULID, primary key
- `created_at` — timestamp
- `updated_at` — timestamp

### 관계

`belongs_to`로 선언. DB에 `{name}_id` 외래키 자동 생성.
역방향 관계(has_many)는 `belongs_to`에서 자동 추론 — 별도 선언 불필요.

```yaml
belongs_to:
  author: users       # → author_id (references users)
  category: categories # → category_id (references categories)
```

`onDelete`는 기본 `cascade`. 변경: `belongs_to: { post: { resource: posts, onDelete: nullify } }`.

예: comments가 `belongs_to: { post: posts }`이면, `GET /api/posts/:id/comments` 자동 생성.

### 액션

CRUD(list, get, create, update, delete)는 기본 제공. 추가 비즈니스 로직은 JS 파일로 정의.

YAML에서 액션 이름을 선언하면, `actions/{리소스}/{액션명}.js` 파일에서 로직 작성.

```yaml
# resources.yaml
resources:
  posts:
    actions: [publish, unpublish, reject]
```

```javascript
// actions/posts/publish.js
export default {
  only: ["author", "admin"],
  from: ["draft"],
  async run({ resource, params, auth, db }) {
    resource.published = true
    resource.published_at = new Date()

    // 다른 리소스 접근 (권한 체크 우회 — 서버 사이드 로직)
    await db.notifications.create({
      user_id: resource.author_id,
      message: "게시글이 발행되었습니다"
    })
  }
}
```

```javascript
// actions/posts/reject.js
export default {
  only: ["admin"],
  params: {
    reason: { type: "string", required: true }
  },
  async run({ resource, params }) {
    resource.status = "rejected"
    resource.reject_reason = params.reason
  }
}
```

액션 JS 스펙:
- `only` — 실행 가능 역할
- `from` — 허용 상태 전이 (resource.status 기준)
- `params` — 입력 파라미터 정의
- `run({ resource, params, auth, db })` — 실행 로직
  - `resource` — 현재 리소스. 필드를 직접 변경하면 DB에 반영됨
  - `db` — 모든 리소스에 CRUD 접근 가능 (권한 체크 우회)

런타임: QuickJS (경량 JS 엔진 내장). Node.js 불필요.

## 권한

리소스에 인라인으로 정의.

```yaml
resources:
  posts:
    access:
      list: [anyone]
      get: [anyone]
      create: [authenticated]
      update: [author, admin]
      delete: [author, admin]
```

### 역할

- `anyone` — 비로그인 포함 전부
- `authenticated` — 로그인한 유저
- `admin` — 관리자
- `{belongs_to 이름}` — 해당 리소스의 소유자 (예: `author`)

### 고급 조건

```yaml
access:
  list:
    - roles: [anyone]
      when: "resource.published == true"
    - roles: [author, admin]
```

`when`: CEL 표현식. 변수:
- `request.auth.sub` — 현재 사용자 ID
- `request.auth.roles` — 사용자 역할 목록
- `resource.*` — 대상 리소스의 필드 값

### 기본값

`access` 미지정 시 기본: `[admin]` (관리자만 가능).

## 타입 생성

`santokit apply` 시 `types/santokit.d.ts`와 `jsconfig.json`을 자동 생성. YAML에서 리소스별 타입을 유도.

```typescript
// types/santokit.d.ts (자동 생성 — 직접 수정하지 않음)

interface Posts {
  id: string
  title: string
  body: string
  published: boolean
  author_id: string
  created_at: string
  updated_at: string
}

interface PostsActionContext {
  resource: Posts
  auth: { sub: string; roles: string[] }
  params: Record<string, any>
  db: DB
}

interface DB {
  [resource: string]: {
    create(data: Record<string, any>): Promise<any>
    get(id: string): Promise<any>
    list(filter?: Record<string, any>): Promise<any[]>
    update(id: string, data: Record<string, any>): Promise<any>
    delete(id: string): Promise<void>
  }
}

interface Action<T = any> {
  only?: string[]
  from?: string[]
  params?: Record<string, { type: string; required?: boolean }>
  run(ctx: T): Promise<void> | void
}

// ... 모든 리소스에 대해 생성
```

```json
// jsconfig.json (자동 생성)
{
  "compilerOptions": {
    "checkJs": true,
    "types": ["./types/santokit"]
  },
  "include": ["actions/**/*.js"]
}
```

이로써 IDE(VSCode 등)와 AI 코딩 도구(Claude Code 등)가 Language Server를 통해 리소스 필드, 타입, 자동완성을 지원.

## API

RESTful. 리소스 이름이 곧 경로 (자동 변환 없음).

```
# CRUD
GET    /api/posts                    목록 조회 (?limit=10&offset=0&sort=-created_at)
GET    /api/posts/:id                상세 조회 (?expand=author,comments)
POST   /api/posts                    생성 { "title": "...", "body": "..." }
PATCH  /api/posts/:id                수정 { "title": "new title" }
DELETE /api/posts/:id                삭제

# 필터링
GET    /api/posts?filter[published]=true&filter[author_id]=xxx

# 액션
POST   /api/posts/:id/publish        액션 실행
POST   /api/posts/:id/unpublish

# 관계 조회 (belongs_to에서 자동 생성)
GET    /api/posts/:id/comments       해당 포스트의 댓글 목록
GET    /api/users/:id/posts          해당 유저의 포스트 목록

# Auth
POST   /api/auth/signup              { "email": "...", "password": "..." }
POST   /api/auth/login               { "email": "...", "password": "..." }
GET    /api/auth/google              → 302 → Google OAuth
GET    /api/auth/google/callback     → 토큰 발급

# Storage
POST   /api/storage/main/upload      presigned URL 요청
GET    /api/storage/main/:key        presigned download URL
DELETE /api/storage/main/:key        삭제
```

인증: `Authorization: Bearer <token>`.
응답: `{ "data": ... }` / `{ "error": { "code": "...", "message": "..." } }`.

### 에러 코드

| 코드 | 이름 | 설명 |
|------|------|------|
| 400 | BAD_REQUEST | 잘못된 요청 |
| 401 | UNAUTHORIZED | 인증 필요 |
| 403 | FORBIDDEN | 권한 없음 |
| 404 | NOT_FOUND | 리소스 없음 |
| 409 | CONFLICT | 중복 (unique 위반 등) |
| 500 | INTERNAL | 서버 내부 오류 |

## CLI

```bash
santokit init                                    # 프로젝트 초기화
santokit apply [--dry-run] [--force]             # YAML → DB 적용 + 타입 생성
santokit serve [--port 8090] [--db "..."]        # 서버 시작
santokit release list                            # 릴리즈 목록
santokit release create [--tag v1.0]             # 현재 YAML 스냅샷 저장
santokit release rollback                        # 이전 릴리즈로 복원
santokit admin create                            # 관리자 계정 생성
santokit apikey create --roles admin             # API 키 생성
santokit help --llm                              # AI용 프로젝트 컨텍스트 출력
```

`apply`: YAML과 DB 현재 상태 diff → DDL 생성/적용 + `types/santokit.d.ts` 자동 생성. `--dry-run`으로 미리보기.
safe alter 자동 적용. destructive 변경은 `--force` 필요.
`release`: YAML 스냅샷을 DB에 저장. 롤백 가능.

### `help --llm`

현재 프로젝트 상태를 AI가 이해할 수 있는 형태로 출력. `resources.yaml`을 읽어서 동적으로 생성.

```
$ santokit help --llm

# Santokit — AI Context
You are working with a Santokit project.

## Project Structure
santokit/
  resources.yaml    — resource definitions (fields, relations, access)
  auth.yaml         — authentication config
  storage.yaml      — file storage config
  actions/          — business logic (JS)
  types/            — auto-generated types (do not edit)

## Key Commands
santokit apply      — apply YAML changes to DB + regenerate types
santokit serve      — start the server

## Current Resources
- users (auth-linked): name, roles | auto: email, password_hash
- posts: title, body, published | belongs_to: author(users) | actions: publish, unpublish
- comments: body | belongs_to: post(posts), author(users)
- post_likes: belongs_to: post(posts), user(users) | unique: [post, user]

## Rules
- Edit YAML files to change schema, not DB directly
- Run `santokit apply` after YAML changes
- Action files go in actions/{resource}/{action}.js
- types/ is auto-generated — never edit manually
```

## 인증 (`auth.yaml`)

```yaml
token:
  type: paseto-v4-local
  expiry: 24h
providers:
  - type: email
    enabled: true
  - type: google
    enabled: true
    clientId: "..."
    clientSecret: "${GOOGLE_CLIENT_SECRET}"
  - type: github
    enabled: true
    clientId: "..."
    clientSecret: "${GITHUB_CLIENT_SECRET}"
```

PASETO v4.local. 서버가 대칭키 자동 생성/관리. secret은 환경 변수 참조.

## 스토리지 (`storage.yaml`)

```yaml
buckets:
  main:
    provider: s3
    region: ap-northeast-2
    bucket: my-app-uploads
    accessKeyId: "${AWS_ACCESS_KEY_ID}"
    secretAccessKey: "${AWS_SECRET_ACCESS_KEY}"
    maxFileSize: 10mb
    allowedTypes: ["image/*", "application/pdf"]
```

S3 presigned URL 기반. 버킷 여러 개 정의 가능.

## 대시보드 (`/_admin`)

- 리소스 목록, 필드/관계 시각화
- 데이터 CRUD (조회, 추가, 수정, 삭제)
- 릴리즈 히스토리

## V2 이후

TS SDK, Realtime (WebSocket), Webhook, 액션 내 외부 API 호출, 멀티파트 업로드, OIDC linking, 쿠키 인증, cursor 페이지네이션, 풀텍스트 검색.
