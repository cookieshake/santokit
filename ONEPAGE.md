# Santokit Spec v5

AI-friendly self-hosted BaaS. 단일 바이너리 (Rust).
YAML 하나로 CRUD, 인증, 권한, 어드민이 나온다. DB 스키마는 자동 유도.
모든 설정이 파일 기반이라 AI 코딩 도구가 백엔드를 통째로 생성/수정 가능.

## 기술 스택

- **언어**: Rust (단일 바이너리, 저메모리, GC 없음)
- **HTTP**: axum
- **DB**: SeaORM + Postgres
- **액션 런타임**: QuickJS (경량 JS 엔진 내장)
- **인증**: PASETO v4.local

## 시작

```bash
santokit init                              # ./santokit/ 디렉토리 + 예제 YAML 생성
docker compose up                          # Postgres + 서버 시작 (포트 8090, 자동 스키마 적용)
```

→ API: `http://localhost:8090/api`
→ 대시보드: `http://localhost:8090/_admin`

## 데이터베이스

Postgres 전용. Postgres 호환 DB(CockroachDB, Neon 등)도 사용 가능.

```yaml
# santokit.yaml (선택)
database: "postgres://user:pass@host/db"    # docker compose 사용 시 자동 설정
```

## 배포

단일 바이너리이므로 어디서든 동작.

```
# 개발
docker compose up                          # 로컬: Postgres + santokit

# 프로덕션 이미지 빌드
docker build -t my-app .                   # Dockerfile로 이미지 생성

# 프로덕션 배포
docker run -e DATABASE_URL="postgres://..." my-app

# 직접 실행 (외부 Postgres 필요)
santokit serve --db "postgres://user:pass@host/db"
```

`santokit init`이 생성하는 Dockerfile:

```dockerfile
FROM santokit:latest
COPY santokit/ /app/santokit/
```

## 설정 디렉토리

```
santokit/
  santokit.yaml       # 리소스, 인증, 스토리지 — 전부 이 파일 하나
  actions/            # 액션 로직 (JS)
    resources/        # 리소스 액션
      posts/
        publish.js
    global/           # 글로벌 액션
      send_newsletter.js
  types/              # 자동 생성 (serve 시)
    santokit.d.ts
  jsconfig.json       # 자동 생성
Dockerfile            # santokit init 시 생성
docker-compose.yml    # santokit init 시 생성
CLAUDE.md             # AI 코딩 도구용 가이드 (santokit init 시 생성)
```

기본: `./santokit/` 탐색. `--config ./path/`로 변경 가능.

## 리소스 (`santokit.yaml`)

리소스 이름이 곧 API 경로와 DB 테이블명. 자동 변환 없음.

```yaml
version: 1
resources:
  users:
    auth: true                               # 인증 리소스
    fields:
      phone: { type: text, optional: true }
    access:
      get: "$auth.sub == id"
      update: "$auth.sub == id"

  profiles:                                  # 공개 프로필 — 누구나 조회 가능
    belongs_to:
      user: users
    unique: [user]
    fields:
      name: text
      avatar: { type: text, optional: true }
    access:
      list: "true"
      get: "true"
      update: "$auth.sub == user.id"

  posts:
    fields:
      title: text
      body: text
      published: { type: boolean, default: false }
    belongs_to:
      author: users
    validation: "author.id == $auth.sub"
    access:
      list: "true"
      get: "true"
      create: "$auth.sub != null"
      update: "$auth.sub == author.id"
      delete: "$auth.sub == author.id || $auth.is_admin"
    search: [title, body]

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

### 인증 리소스 (`auth: true`)

하나의 리소스에 `auth: true`를 지정하면 인증 시스템과 연결. 이름은 자유 (`users`, `accounts`, `members` 등).
`auth: true`인 리소스가 없으면 `validate`/`apply` 시 에러.

`auth: true`는 `auth: { identity: email }`과 동일. identity를 변경하려면:

```yaml
players:
  auth:
    identity: username           # username이 로그인 식별자 (기본: email)
  fields:
    nickname: text
```

자동 포함 필드:
- `{identity}` — unique, 로그인 식별자 (email 또는 username)
- `password_hash` — 내부 관리, API 노출 안 됨
- `is_admin` — boolean (기본: false, API 수정 불가)

커스텀 역할이 필요하면 직접 필드 추가:

```yaml
users:
  auth: true
  fields:
    name: { type: text, optional: true }
    is_editor: { type: boolean, default: false }
    is_moderator: { type: boolean, default: false }
```

사용자는 추가 필드만 정의하면 됨 (`name`, `avatar` 등).

### 필드 타입

`text`, `number`, `decimal`, `boolean`, `timestamp`, `enum`. 배열은 `[]` 붙임 (`text[]`, `number[]`).

- `number` — 정수 (내부: `bigint`)
- `decimal` — 소수 (기본: `decimal(19,4)`, 커스텀: `{ type: decimal, precision: 10, scale: 2 }`)
- `enum` — 허용 값 목록: `{ type: enum, values: [draft, published, archived] }`

축약: `title: text`은 `title: { type: text }`과 동일.

### 검증

- `optional: true` — 빈 값 허용 (기본: 필수)
- `validation` — JS 표현식. `value`로 현재 값 참조. 실패 시 에러.

```yaml
fields:
  title: { type: text, validation: "value.length <= 200" }
  password: { type: text, validation: "value.length >= 8" }
  age: { type: number, validation: "value >= 0 && value <= 200" }
  status: { type: enum, values: [draft, published, archived] }
  nickname: { type: text, optional: true }
```

### 자동 생성 필드

모든 리소스에 자동 포함 (명시 불필요):
- `id` — ULID, primary key
- `created_at` — timestamp
- `updated_at` — timestamp

### 관계

`belongs_to`로 선언. DB에 `{name}_id` 외래키 자동 생성.
역방향 관계(has_many)는 `belongs_to`에서 자동 추론 — 별도 선언 불필요.

```yaml
# 사람을 가리킬 수도 있고
belongs_to:
  author: users       # → author_id (references users)

# 리소스 간 관계도 동일
belongs_to:
  list: transaction_lists   # → list_id (references transaction_lists)
  category: categories      # → category_id (references categories)
```

어떤 리소스든 `belongs_to` 대상이 될 수 있음. `onDelete`는 `cascade` 고정.

예: comments가 `belongs_to: { post: posts }`이면, `GET /api/posts/:id/comments` 자동 생성.

### 리소스 검증

`validation` — JS 표현식으로 리소스 레벨 검증. 필드명과 `auth`를 직접 참조.

```yaml
posts:
  belongs_to:
    author: users
  validation: "author.id == auth.sub"        # 생성 시 작성자 = 현재 유저
```

### 검색

`search` 필드를 지정하면 `?q=` 파라미터로 ILIKE 검색 가능.

```yaml
posts:
  search: [title, body]
```

```
GET /api/posts?q=검색어                   # search 전체 필드
GET /api/posts?q[title]=검색어            # title만
GET /api/posts?q[title,body]=검색어       # title, body만
```

ILIKE 기반. 모든 언어에서 동작하며 추가 확장 불필요.
`search` 미지정 시 `?q=` 무시. `q[필드]`에 지정한 필드가 `search`에 없으면 무시.

### 액션

CRUD(list, get, create, update, delete)는 기본 제공. 추가 비즈니스 로직은 JS 파일로 정의.

YAML 선언 불필요 — 파일이 있으면 자동 등록.

- 리소스 액션: `actions/resources/{리소스}/{액션명}.js` → `POST /api/{리소스}/:id/{액션}`
- 글로벌 액션: `actions/global/{액션명}.js` → `POST /api/actions/{액션}`

```javascript
// actions/resources/posts/publish.js
export default {
  only: ["author", "admin"],
  async run(ctx) {
    ctx.resource.published = true
    ctx.resource.published_at = new Date()

    // 다른 리소스 접근 (권한 체크 우회 — 서버 사이드 로직)
    await ctx.db.notifications.create({
      user_id: ctx.resource.author_id,
      message: "게시글이 발행되었습니다"
    })
  }
}
```

```javascript
// actions/resources/posts/reject.js
export default {
  only: ["admin"],
  params: {
    reason: { type: "string", required: true }
  },
  async run({ resource, params }) {                  // 구조분해
    resource.status = "rejected"
    resource.reject_reason = params.reason
  }
}
```

액션 JS 스펙:
- `only` — 실행 가능 역할
- `params` — 입력 파라미터 정의
- `run(ctx)` — 실행 로직. 구조분해도 가능: `run({ resource, auth, db })`
  - `ctx.resource` — 현재 리소스. 필드를 직접 변경하면 DB에 반영됨
  - `ctx.auth` — 현재 유저 정보 (`sub`, `roles`)
  - `ctx.db` — 모든 리소스에 CRUD 접근 가능 (권한 체크 우회)
  - `ctx.params` — 액션 입력 파라미터
  - `ctx.now` — 현재 시간
  - `ctx.env` — 환경 변수
  - `ctx.fetch` — 외부 HTTP 호출

### 글로벌 액션

리소스에 종속되지 않는 액션. `actions/global/`에 파일을 두면 자동 등록.

```javascript
// actions/global/send_newsletter.js
export default {
  only: ["admin"],
  async run({ db, fetch }) {
    const users = await db.users.list()
    await fetch("https://api.sendgrid.com/...", {
      method: "POST",
      body: JSON.stringify({ to: users.map(u => u.email) })
    })
  }
}
```

```
POST /api/actions/send_newsletter     # 글로벌 액션 호출
```

글로벌 액션에는 `ctx.resource`가 없음. 나머지(`ctx.db`, `ctx.auth`, `ctx.fetch` 등)는 동일.

런타임: QuickJS (경량 JS 엔진 내장). Node.js 불필요.

## 권한

리소스에 인라인 JS 표현식으로 정의. `$auth`로 현재 유저, 필드명으로 리소스 참조.

```yaml
resources:
  posts:
    access:
      list: "true"
      get: "true"
      create: "$auth.sub != null"
      update: "$auth.sub == author.id"
      delete: "$auth.sub == author.id || $auth.is_admin"
```

```yaml
# 예: 가계부 앱 — 같은 조직 소속이면 조회, 본인만 수정
transactions:
  belongs_to:
    organization: organizations
    creator: users
  access:
    list: "$auth.organization_id == organization.id"
    create: "$auth.organization_id == organization.id"
    update: "$auth.sub == creator.id"
    delete: "$auth.is_admin"
```

### 필드별 접근 제어

필드 레벨 access 대신, 공개/비공개 리소스를 분리하여 해결.

```yaml
users:
  auth: true
  fields:
    phone: text                      # 비공개 — 본인만 접근
  access:
    get: "$auth.sub == id"

profiles:
  belongs_to:
    user: users
  unique: [user]
  fields:
    name: text                       # 공개 — 누구나 조회 가능
    avatar: { type: text, optional: true }
  access:
    list: "true"
    get: "true"
    update: "$auth.sub == user.id"
```

post에서 작성자 정보 조회: `GET /api/posts/:id?expand=author.profile`

### 기본값

`access` 미지정 시 기본: `"$auth.is_admin"` (관리자만 가능).

## 타입 생성

`santokit apply` 시 `types/santokit.d.ts`와 `jsconfig.json`을 자동 생성. YAML에서 리소스별 타입을 유도.

```typescript
// types/santokit.d.ts (자동 생성 — 직접 수정하지 않음)

interface Posts {
  id: string
  title: text
  body: text
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

# 검색 (search 필드 지정 시)
GET    /api/posts?q=검색어

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
| 422 | VALIDATION_ERROR | 유효성 검증 실패 |
| 500 | INTERNAL | 서버 내부 오류 |

## CLI

```bash
santokit init                                    # 프로젝트 초기화
santokit validate                                # YAML 검증 (DB 연결 불필요)
santokit serve [--port 8090] [--db "..."]        # 서버 시작 (자동 스키마 적용 + 타입 생성)
santokit help --llm                              # AI용 프로젝트 컨텍스트 출력
```

`serve` 시작 시 YAML과 DB 현재 상태 diff → safe alter 자동 적용 + `types/santokit.d.ts` 자동 생성.
destructive 변경은 로그 경고 후 무시. `SANTOKIT_FORCE_APPLY=true` 환경변수로 강제 적용.

### 환경변수

```bash
SANTOKIT_DB="postgres://..."              # DB 연결 (--db와 동일)
SANTOKIT_PORT=8090                         # 포트 (--port와 동일)
SANTOKIT_FORCE_APPLY=true                  # destructive 변경 강제 적용
SANTOKIT_ADMIN_EMAIL="admin@example.com"   # admin 유저 자동 생성
SANTOKIT_ADMIN_PASSWORD="securepass"       # admin 비밀번호
```

`SANTOKIT_ADMIN_*` 설정 시 서버 시작할 때 해당 유저를 `is_admin: true`로 자동 생성. 이미 존재하면 무시.

### `help --llm`

현재 프로젝트 상태를 AI가 이해할 수 있는 형태로 출력. `resources.yaml`을 읽어서 동적으로 생성.

```
$ santokit help --llm

# Santokit — AI Context
You are working with a Santokit project.

## Project Structure
santokit/
  santokit.yaml     — resources, auth, storage (all-in-one)
  actions/          — business logic (JS)
  types/            — auto-generated types (do not edit)

## Key Commands
santokit validate   — validate YAML without DB
santokit serve      — start server (auto-applies schema changes)

## Current Resources
- users (auth: true): name, roles | auto: email, password_hash
- posts: title, body, published | belongs_to: author(users) | actions: publish, unpublish
- comments: body | belongs_to: post(posts), author(users)
- post_likes: belongs_to: post(posts), user(users) | unique: [post, user]

## Rules
- Edit YAML files to change schema, not DB directly
- Restart `santokit serve` after YAML changes (auto-applies)
- Action files go in actions/{resource}/{action}.js
- types/ is auto-generated — never edit manually
```

## 인증 (`santokit.yaml` 내 `auth`)

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

## 스토리지 (`santokit.yaml` 내 `storage`)

```yaml
buckets:
  main:
    provider: s3
    region: ap-northeast-2
    bucket: my-app-uploads
    accessKeyId: "${AWS_ACCESS_KEY_ID}"
    secretAccessKey: "${AWS_SECRET_ACCESS_KEY}"
```

S3 presigned URL 기반. 버킷 여러 개 정의 가능.

## 대시보드 (`/_admin`)

- 리소스 목록, 필드/관계 시각화
- 데이터 CRUD (조회, 추가, 수정, 삭제)

