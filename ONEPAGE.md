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

### `santokit.yaml` 전체 구조

```yaml
version: 1
database: "postgres://..."              # 선택 (docker compose 시 자동)

resources:
  users: ...
  posts: ...

auth:
  token:
    type: paseto-v4-local
    expiry: 24h
  providers:
    - type: email
    - type: google

storage:
  buckets:
    images: ...
    media: ...
```

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
      get: [self]
      update: [self]

  profiles:                                  # 공개 프로필 — 누구나 조회 가능
    belongs_to:
      user: { resource: users, on_delete: cascade }
    unique: [user]
    fields:
      name: text
      avatar: { type: file, bucket: images, optional: true }
    access:
      list: [anyone]
      get: [anyone]
      update: [user]                         # belongs_to user = 본인

  posts:
    fields:
      title: text
      body: text
      published: { type: boolean, default: false }
    belongs_to:
      author: { resource: users, on_delete: restrict }
    validation: "$auth.sub == author.id"
    access:
      list: [anyone]
      get: [anyone]
      create: [auth]
      update: [author]
      delete: [author, admin]
    search: [title, body]

  comments:
    fields:
      body: text
    belongs_to:
      post: { resource: posts, on_delete: cascade }
      author: { resource: users, on_delete: restrict }

  post_likes:
    belongs_to:
      post: { resource: posts, on_delete: cascade }
      user: { resource: users, on_delete: cascade }
    unique: [post, user]
```

### 인증 리소스 (`auth: true`)

하나의 리소스에 `auth: true`를 지정하면 인증 시스템과 연결. 이름은 자유 (`users`, `accounts`, `members` 등).
`auth: true`인 리소스가 없는데 auth provider가 설정되어 있거나 access에서 `$auth`를 참조하면 `validate` 시 에러.

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
- `is_admin` — boolean (기본: false, REST API 수정 불가. 대시보드 또는 액션 `ctx.db`에서 변경 가능)

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

`text`, `number`, `decimal`, `boolean`, `timestamp`, `enum`, `file`. 배열은 `[]` 붙임 (`text[]`, `number[]`).

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

`belongs_to`로 선언. DB에 `_rel_{name}_id` 내부 컬럼 자동 생성 (유저 필드와 충돌 방지).
역방향 관계(has_many)는 `belongs_to`에서 자동 추론 — 별도 선언 불필요.
유저 정의 필드명은 `_` prefix 사용 불가 (`validate` 시 에러).

```yaml
belongs_to:
  author: { resource: users, on_delete: restrict }
  category: { resource: categories, on_delete: cascade }
```

`on_delete` 필수 명시:
- `cascade` — 부모 삭제 시 자식도 삭제
- `restrict` — 자식이 있으면 부모 삭제 불가

예: comments가 `belongs_to: { post: posts }`이면, `GET /api/posts/:id/comments` 자동 생성.

### 리소스 검증

`validation` — JS 표현식으로 리소스 레벨 검증. 필드명과 `$auth`를 직접 참조.
create + update 시 모두 실행. 실행 순서: access 체크 → 필드 validation → 리소스 validation.

```yaml
posts:
  belongs_to:
    author: { resource: users, on_delete: restrict }
  validation: "$auth.sub == author.id"        # 작성자 = 현재 유저
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
  access: ["author", "admin"],
  async run(ctx) {
    ctx.resource.published = true
    ctx.resource.published_at = new Date()

    // 다른 리소스 접근 (권한 체크 우회 — 서버 사이드 로직)
    await ctx.db.notifications.create({
      user_id: ctx.resource.author.id,
      message: "게시글이 발행되었습니다"
    })
  }
}
```

```javascript
// actions/resources/posts/reject.js
export default {
  access: ["admin"],
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
- `access` — 키워드 리스트. CRUD access와 동일 문법. 미지정 시 `["admin"]` (관리자만)
- `params` — 입력 파라미터 정의
- `run(ctx)` — 실행 로직. 구조분해도 가능: `run({ resource, auth, db })`
  - `ctx.resource` — 현재 리소스. 필드를 직접 변경하면 `run()` 종료 후 DB에 한번에 저장. 에러 시 전체 롤백 (트랜잭션)
  - `ctx.auth` — 현재 유저 정보 (`sub`, `is_admin`, 커스텀 필드)
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
  access: ["admin"],
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

키워드 리스트로 정의. 사용 가능한 키워드:

- `anyone` — 누구나 (비로그인 포함)
- `auth` — 로그인한 유저
- `self` — 본인 (auth 리소스 전용, `auth.sub == id`)
- `admin` — `is_admin == true`인 유저
- `{관계명}` — belongs_to 관계 기반 체크. 관계 대상이 auth 리소스면 소유자 체크 (`auth.sub == record.{관계명}_id`), 아니면 공유 부모 체크 (`auth.{관계명}_id == record.{관계명}_id`)
- `{is_* 필드명에서 is_ 제거}` — auth 리소스의 boolean 필드 (예: `is_editor` → `editor`)

리스트 내 키워드는 OR 관계.

```yaml
resources:
  posts:
    access:
      list: [anyone]
      get: [anyone]
      create: [auth]
      update: [author]
      delete: [author, admin]
```

```yaml
# 예: 가계부 앱 — 같은 조직 소속이면 조회, 본인만 수정
users:
  auth: true
  belongs_to:
    organization: { resource: organizations, on_delete: restrict }

transactions:
  belongs_to:
    organization: { resource: organizations, on_delete: cascade }
    creator: { resource: users, on_delete: restrict }
  access:
    list: [organization]               # 같은 조직 소속
    create: [organization]
    update: [creator]
    delete: [admin]
```

### 필드별 접근 제어

필드 레벨 access 대신, 공개/비공개 리소스를 분리하여 해결.

```yaml
users:
  auth: true
  fields:
    phone: text                      # 비공개 — 본인만 접근
  access:
    get: [self]

profiles:
  belongs_to:
    user: { resource: users, on_delete: cascade }
  unique: [user]
  fields:
    name: text                       # 공개 — 누구나 조회 가능
    avatar: { type: file, bucket: images, optional: true }
  access:
    list: [anyone]
    get: [anyone]
    update: [user]
```

post에서 작성자 정보 조회: `GET /api/posts/:id?expand=author.profile`

### expand

`?expand=`로 belongs_to 관계를 펼쳐서 조회. 중첩 depth 제한 없음.

belongs_to 관계는 API 응답에서 `{ id }` 객체로 표현. expand하면 필드가 채워짐:

```json
// GET /api/posts/:id
{ "id": "...", "title": "...", "author": { "id": "abc123" } }

// GET /api/posts/:id?expand=author
{ "id": "...", "title": "...", "author": { "id": "abc123", "name": "..." } }

// GET /api/posts/:id?expand=author.profile (중첩)
{
  "id": "...", "title": "...",
  "author": {
    "id": "abc123", "name": "...",
    "profile": { "id": "...", "avatar": "..." }
  }
}
```

생성/수정 요청도 동일한 객체 형식:

```json
// POST /api/posts
{ "title": "...", "body": "...", "author": { "id": "abc123" } }
```

### 기본값

`access` 미지정 시 기본: `[admin]` (관리자만 가능).

## 타입 생성

`santokit serve` 시작 시 `types/santokit.d.ts`와 `jsconfig.json`을 자동 생성. YAML에서 리소스별 타입을 유도.

```typescript
// types/santokit.d.ts (자동 생성 — 직접 수정하지 않음)

interface Posts {
  id: string
  title: string
  body: string
  published: boolean
  author: { id: string }                     // belongs_to → 객체 (expand 시 필드 채워짐)
  created_at: string
  updated_at: string
}

interface PostsActionContext {
  resource: Posts
  auth: { sub: string; is_admin: boolean; [key: string]: any }
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
  access?: string[]
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
GET    /api/posts?filter[published]=true&filter[author.id]=xxx

# 액션
POST   /api/posts/:id/publish        액션 실행
POST   /api/posts/:id/unpublish

# 관계 조회 (belongs_to에서 자동 생성)
GET    /api/posts/:id/comments       해당 포스트의 댓글 목록
GET    /api/users/:id/posts          해당 유저의 포스트 목록

# Auth
POST   /api/auth/signup              { "email": "...", "password": "..." }
POST   /api/auth/login               { "email": "...", "password": "..." }
POST   /api/auth/set-password        비밀번호 설정 (OAuth 유저용, 로그인 필요)
GET    /api/auth/google              → 302 → Google OAuth
GET    /api/auth/google/callback     → 토큰 발급
POST   /api/auth/link/google         기존 계정에 OAuth 연결 (로그인 필요)
POST   /api/auth/unlink/google       OAuth 연결 해제 (로그인 필요)

# Storage
POST   /api/{리소스}/presign/{필드}    presigned 업로드 URL 발급 (redirect 버킷만)
GET    /api/storage/{bucket}/:key     다운로드 (버킷 serve 설정에 따라 proxy 또는 redirect)
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

현재 프로젝트 상태를 AI가 이해할 수 있는 형태로 출력. `santokit.yaml`을 읽어서 동적으로 생성.

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
- users (auth: true): name | auto: email, password_hash, is_admin
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
auth:
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

### 계정 정책

- 같은 email로 중복 가입 시도 → 에러 (409 CONFLICT)
- 기존 계정에 OAuth 연결 추가 가능 (로그인 상태에서 `POST /api/auth/link/{provider}`)
- OAuth 전용 유저도 email provider가 켜져 있으면 `POST /api/auth/set-password`로 비밀번호 설정 후 email 로그인 가능

## 스토리지 (`santokit.yaml` 내 `storage`)

```yaml
storage:
  buckets:
    images:
      provider: s3
      serve: proxy                             # 서버가 파일 직접 전달
      region: ap-northeast-2
      bucket: my-app-images
      accessKeyId: "${AWS_ACCESS_KEY_ID}"
      secretAccessKey: "${AWS_SECRET_ACCESS_KEY}"
    media:
      provider: s3
      serve: redirect                          # S3 presigned URL로 302 redirect
      region: ap-northeast-2
      bucket: my-app-media
      accessKeyId: "${AWS_ACCESS_KEY_ID}"
      secretAccessKey: "${AWS_SECRET_ACCESS_KEY}"
```

`serve` 필수 명시:
- `proxy` — 서버가 S3에서 받아서 전달 (작은 파일)
- `redirect` — S3 presigned URL로 302 (큰 파일)

버킷 여러 개 정의 가능.

### 파일 필드

리소스 필드에 `file` 타입을 사용하면 스토리지 버킷과 연결. 파일의 access는 해당 리소스의 access 규칙을 따름.

```yaml
profiles:
  fields:
    avatar: { type: file, bucket: images, optional: true }
  access:
    get: [anyone]       # → avatar 다운로드도 anyone
    update: [user]      # → avatar 업로드/교체도 user만

posts:
  fields:
    attachment: { type: file, bucket: media, optional: true }
```

**업로드** — 버킷의 `serve` 설정에 따라 결정:

```
# proxy 모드: multipart로 서버 경유
PATCH /api/profiles/:id (multipart, avatar: <file>)
→ 서버가 S3에 업로드 → DB에 key 저장

# redirect 모드: presigned URL로 S3 직접 업로드
POST /api/posts/presign/attachment   → { url: "https://s3.../presigned", key: "abc" }
# 클라이언트가 S3에 직접 업로드
PUT https://s3.../presigned
# 레코드에 연결
POST /api/posts { title: "...", attachment: "abc" }
```

**파일 자동 삭제:**
- 레코드 삭제 → 연결된 S3 파일 자동 삭제
- 파일 필드 변경 → 이전 S3 파일 자동 삭제
- 파일 필드 null로 변경 → S3 파일 자동 삭제

presign 후 레코드에 연결되지 않은 미연결 파일은 서버가 주기적으로 정리.

**다운로드** — file 필드 응답은 URL 문자열:

```json
{ "avatar": "/api/storage/images/abc123" }
```

요청 시 access 체크 후:
- `proxy` 버킷 → 서버가 파일을 직접 전달
- `redirect` 버킷 → S3 presigned URL로 302 redirect

## 대시보드 (`/_admin`)

`is_admin` 유저만 접근 가능. 로그인 필요.

- 리소스 목록, 필드/관계 시각화
- 데이터 CRUD (조회, 추가, 수정, 삭제)

