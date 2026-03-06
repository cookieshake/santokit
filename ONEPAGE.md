# Santokit Spec v2

프로덕션급 self-hosted BaaS. BYO Postgres. 단일 바이너리.
차별점: PocketBase/TrailBase는 SQLite(프로토타입용). Santokit은 Postgres(프로덕션용).

## 시작

```bash
santokit init                           # ./santokit/ 디렉토리 + 기본 YAML 생성
santokit migrate --db "postgres://..."      # DDL 적용
santokit serve --db "postgres://..."

# docker-compose (Postgres 포함)
docker compose up
```

→ API: `http://localhost:8090/api`
→ 대시보드: `http://localhost:8090/_admin`

## 설정 디렉토리

```
santokit/
  schema.yaml
  permissions.yaml
  auth.yaml
  storage.yaml
```

기본: `./santokit/` 탐색. `--config ./path/` 로 변경 가능.
YAML 없이 `serve` 하면 에러 + `santokit init` 안내.
YAML 변경 시 `migrate` 후 `serve` 재시작으로 반영.

## 스키마 (`schema.yaml`)

```yaml
version: 1
tables:
  users:
    columns:
      id: { generate: ulid, primaryKey: true }
      email: { type: string, nullable: false, unique: true }
      created_at: { type: timestamp, default: now }
  posts:
    columns:
      id: { generate: ulid, primaryKey: true }
      user_id: { type: string, references: { table: users, onDelete: cascade } }
      title: { type: string }
      body: { type: string, nullable: true }
```

타입: `string`, `int`, `bigint`, `float`, `decimal(p,s)`, `boolean`, `json`, `timestamp`, `text[]`, `int[]`.
PK 생성: `ulid`(기본), `uuid_v4`, `uuid_v7`, `auto_increment`, `client`.
`generate` 있으면 `type` 자동 추론 (`ulid/uuid_v4/uuid_v7` → `string`, `auto_increment` → `bigint`). 명시하면 호환성 검증.
Postgres-only. 네이티브 타입/인덱스 직접 지원.

## 권한 (`permissions.yaml`)

```yaml
default:
  - roles: [admin]

tables:
  users:
    select:
      - roles: [authenticated]
        when: "request.auth.sub == resource.id"
      - roles: [admin]
    update:
      - roles: [authenticated]
        when: "request.auth.sub == resource.id"
        columns: [email]
```

`default`: 명시 안 한 모든 테이블/operation에 적용. 테이블에 operation을 명시하면 해당 operation만 오버라이드 (default 무시).
`when`: CEL 표현식. 변수:
- `request.auth.sub` — JWT subject (사용자 ID)
- `request.auth.roles` — 사용자 역할 목록
- `resource.*` — 대상 행의 컬럼 값

## API

경로 기반 라우팅. 전부 POST (OAuth만 GET).

```
# CRUD
POST /api/db/users/select     { "where": { "email": "a@b.com" }, "limit": 10, "expand": ["posts"] }
POST /api/db/users/insert     { "data": { "email": "a@b.com" } }
POST /api/db/users/update     { "where": { "id": "..." }, "data": { "email": "new@b.com" } }
POST /api/db/users/delete     { "where": { "id": "..." } }

# Auth
POST /api/auth/signup         { "email": "a@b.com", "password": "..." }
POST /api/auth/login          { "email": "a@b.com", "password": "..." }

# OAuth (브라우저 리다이렉트 플로우)
GET  /api/auth/google                → 302 → Google 로그인
GET  /api/auth/google/callback       → JWT 발급 → 프론트 리다이렉트

# Storage
POST /api/storage/main/upload_sign   { "key": "avatar.png", "contentType": "image/png" }
POST /api/storage/main/download_sign { "key": "avatar.png" }
```

인증: `Authorization: Bearer <paseto-token>` 또는 `X-Santokit-Api-Key: <key>`.
응답: `{ "data": ... }` / `{ "error": { "code": "...", "message": "..." } }`.
에러: `BAD_REQUEST(400)`, `UNAUTHORIZED(401)`, `FORBIDDEN(403)`, `NOT_FOUND(404)`, `CONFLICT(409)`, `INTERNAL(500)`.

## CLI

```bash
santokit init                                # ./santokit/ + 기본 YAML 생성
santokit migrate [--dry-run] [--force]       # YAML → DB DDL 적용
santokit serve --db "postgres://..." [--port 8090] [--config ./santokit/]
santokit apikey create --roles admin         # API 키 생성
santokit admin create                        # 관리자 계정 생성
```

migrate: YAML과 DB 현재 상태 diff → DDL 생성/적용. `--dry-run`으로 미리보기.
safe alter (컬럼 추가, nullable 변경 등) 자동 적용. destructive (컬럼 삭제, 타입 변경 등)는 `--force` 필요.
`serve`는 서버만 띄움. 스키마 불일치 감지 시 경고 로그.

## 대시보드 (`/_admin`)

읽기 전용: 테이블 목록, 스키마 시각화, 권한 뷰.
읽기/쓰기: 데이터(행) CRUD (조회, 추가, 수정, 삭제).
V2: 스키마 편집, 권한 편집, Auth 설정 (YAML 편집 UI).

## 인증 (`auth.yaml`)

```yaml
token:
  type: paseto-v4-local  # 서버가 대칭키 자동 생성/관리
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

PASETO v4.local (XChaCha20-Poly1305). 클라이언트는 토큰 내용 볼 수 없음 (암호화). 서버가 대칭키 자동 생성/관리. secret은 환경 변수 참조.

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

S3 presigned URL 기반. 업로드/다운로드/삭제.
버킷 여러 개 정의 가능 (`main`, `avatars`, ...). action에서 버킷명으로 접근: `storage.main.upload_sign`.

## V2 이후

대시보드 편집, Custom SQL Logic, TS SDK, 멀티파트, OIDC linking, 쿠키 인증, cursor 페이지네이션, Org 계층, 멀티 DB, Hub/Bridge 분리.
