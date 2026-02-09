# Auth — Spec (Operator + End User Accounts)

목표:
- Santokit “사람 주체”를 두 종류로 분리해 모델링한다.
  - Operator: Hub(Control Plane)를 운영/관리하는 팀 멤버(사람)
  - End User: Bridge(Data Plane)의 `/call`을 호출하는 앱의 최종 사용자(사람)
- 웹 콘솔 없이 `stk`(CLI)로만 운영/관리 플로우가 가능해야 한다.

핵심 원칙:
- Control Plane은 “사용자 로그인 + 팀/프로젝트 RBAC”을 전제로 한다.
- Data Plane은 “프로젝트 API 키(서버/CI)” + “End User access token”을 지원한다.
- 외부 OIDC JWT는 Hub(Control Plane)에서 검증/통합한 뒤 access token으로 교환한다.
- project/env 격리는 “라우팅”이 아니라 **검증된 credential**로 강제한다.
- Hub(Control Plane)는 End User에 대해 “내장 계정관리 + 토큰 발급(issuer)”을 제공할 수 있다.
- 또한 외부 OIDC issuer 연동도 지원한다(프로젝트별 선택).

결정:
- Bridge(Data Plane)만 토큰을 검증한다(외부 게이트웨이/서드파티 검증 요구 없음).
- End User의 `roles`는 “Santokit 발급 access token”에 포함한다(허브 조회 없이 인가 가능).

---

## 1) Runtime Modes

### Dev Mode
- `STK_DISABLE_AUTH=true`면 auth/permission 체크를 모두 우회한다.

### Enforced Mode
- `STK_DISABLE_AUTH=false`(default)면 아래 정책에 따라 검증한다.

---

## 2) Operator Accounts & Auth (Hub / Control Plane)

대상:
- `stk`가 호출하는 Hub API(프로젝트/환경/연결정보/키/권한/릴리즈 관리)

요구:
- Operator(사람)가 로그인할 수 있어야 한다.
- Hub(Control Plane)는 org/team/project 단위 RBAC을 가진다(예: org owner/admin/member).

계정관리(필수):
- Operator는 Hub에 저장된다(초대/가입/비활성화/역할 변경).
- 비밀번호는 `argon2id` 또는 `bcrypt`로 해시 저장한다(평문 저장 금지).

인증(필수):
- `stk login` → Hub에서 Control Plane access token 발급
- 토큰은 로컬 머신에 저장되고, `stk`가 Hub API 호출에 사용한다.

권한(필수):
- org/team/project 범위에서 Operator RBAC을 평가한다.

---

## 3) End User Accounts & Data Plane Auth (Bridge / Data Plane)

Bridge(`/call`)는 두 종류의 credential을 다룬다.

### 3.1 Project API Key (서버/CI)
요청 헤더:
- `X-Santokit-Api-Key: <api_key>`

키 속성:
- 스코프는 `project + env`에 바인딩된다. (예: `myproj:prod`)
- 키는 “keyId + secret” 형태이며, Hub는 평문 저장을 금지한다.
- 회전을 위해 최소 2개 동시 활성(또는 versioned) 모델을 지원한다.

권장 UX:
- `apiKey` 값은 생성 시 **1회만** 노출한다(재조회 불가).
- CLI는 `keyId`와 `apiKey`를 함께 출력한다.

### 3.2 End User JWT (OIDC)
요청 헤더:
- `Authorization: Bearer <jwt>` (외부 issuer 토큰; Hub에서 검증/교환 입력으로 사용)

검증:
- JWKS로 signature 검증
- `iss`/`exp` 체크
- `aud`는 설정 시에만 체크

표준 claims 매핑:
- `sub` → `user.id`
- `roles` 또는 `role` → `user.roles: string[]`

issuer 선택:
- (내장) Hub(Control Plane)가 End User 토큰을 발급하는 issuer 역할을 한다.
- (외부) 프로젝트가 지정한 외부 OIDC issuer를 사용한다.

내장 issuer 필수 기능:
- 여러 외부 issuer 지원 + account linking(정규화)
- token TTL/refresh 정책

중요:
- 외부 OIDC JWT는 “로그인/연동 입력”으로만 사용한다.
- Bridge(Data Plane)가 매 요청에서 검증하는 토큰은 Santokit이 발급한 토큰이다(아래 3.3).

결정:
- 외부 OIDC 연동은 Hub(Control Plane)가 callback을 직접 처리하는 “Hub OIDC Flow” 하나로 통일한다.
- `/endusers/exchange` 같은 “프론트에서 토큰을 들고 와서 교환” 방식은 제공하지 않는다.

### 3.3 Santokit Access Token (Encrypted, Bridge-Verified)

목표:
- 클라이언트가 토큰 payload를 “까볼” 수 없도록 한다.
- Hub(Control Plane) 조회 없이 Bridge(Data Plane)에서만 검증/복호화한다.

형식(권장):
- PASETO `v4.local` (대칭키 암호화)

토큰에 포함되는 최소 claims:
- `sub`: 내부 End User id (정규화된 id)
- `projectId`, `envId` (또는 동등한 스코프 식별자)
- `roles: string[]`
- `iat`, `exp`
- `jti` (revocation/audit correlation 용도)

검증:
- Bridge는 `exp`와 `project/env` 바인딩을 검증한다.
- `project/env` 라우팅 힌트(Host/header)와 토큰의 `projectId/envId`가 불일치하면 `403`.

키 관리/로테이션:
- 토큰 헤더에 `kid`를 포함한다.
- Bridge는 “현재 키 + 이전 키(들)”을 로딩해 검증한다(롤링 배포 지원).
- Hub는 새 키로 발급을 전환한 뒤, 충분한 유예 기간 후 이전 키를 폐기한다.

Refresh:
- refresh token은 opaque(랜덤)으로 발급하고 Hub에 해시로 저장한다(Bridge는 refresh 처리 안 함).

쿠키 발급(SSR 지원):
- Hub는 End User access token을 HttpOnly 쿠키로도 발급할 수 있다.
  - 예: `Set-Cookie: stk_access=<paseto>; HttpOnly; Secure; SameSite=Lax; Path=/`
- refresh token도 HttpOnly 쿠키로 운용할 수 있다(권장).

멀티 프로젝트(같은 Hub 도메인) 주의:
- Hub가 여러 프로젝트를 한 도메인에서 처리하면, 쿠키 이름 충돌로 “동시에 여러 프로젝트 로그인”이 어려워진다.

결정: 쿠키 네임스페이스
- 쿠키 이름에 `project/env`를 포함해 네임스페이스한다.
  - 예: `stk_access_<project>_<env>`, `stk_refresh_<project>_<env>`
- Hub는 로그인/갱신/로그아웃 시 요청 컨텍스트의 `project/env`에 맞는 쿠키만 설정/폐기한다.
- Bridge는 요청 컨텍스트의 `project/env`를 결정한 뒤, 해당 네임스페이스 쿠키를 선택한다.
- Bridge는 End User access token을 `Authorization` 헤더 또는(옵션) 네임스페이스 쿠키에서 받을 수 있다.

---

## 4) Context Binding / Environment Isolation (필수)

### 4.1 Project API Key
- Bridge는 API key를 먼저 검증한다.
- key가 바인딩한 `project/env`를 **최종 요청 컨텍스트**로 설정한다.
- 요청이 `X-Santokit-Project`, `X-Santokit-Env`를 보내더라도 “라우팅 힌트”일 뿐이다.
- header의 `project/env`와 key의 `project/env`가 다르면 `403`으로 거부한다(헤더로 env 바꿔치기 불가).

### 4.2 External OIDC JWT
- 외부 OIDC JWT는 Hub(Control Plane)의 “로그인/연동 입력”으로 사용한다.
- Hub는 여러 issuer의 subject를 통합(linking/정규화)한 뒤 Santokit access token을 발급한다.

### 4.3 End User Access Token (Santokit)
- 최종 인가에 사용되는 End User credential은 Santokit access token이다.
- 토큰의 `projectId/envId` 바인딩이 라우팅 힌트보다 우선한다.

---

## 5) Roles / Permissions (Data Plane)

권한 판단에 쓰는 roles의 출처:
- API key: key에 부여된 `roles`(예: `admin`, `writer`, `reader`)
- End-user JWT: 토큰 claims에서 파싱한 `user.roles`

Auto CRUD 권한 체크에 사용한다.

---

## 6) How Logic Declares Auth

로직 메타(프론트매터 또는 twin metadata)에서:
- `auth: authenticated` (default)
- `auth: public`
- `roles: [admin, ...]` (API key roles 또는 user.roles에 적용)

Bridge 처리:
- `public`: 로직 레벨의 추가 인증 요구는 없음. 단, Bridge 공통 인증 게이트웨이는 credential을 요구한다.
- `roles`: (API key 또는 JWT) 필요 + role 포함 필요

---

## 7) End User Account APIs (Hub Issuer Mode)

내장 issuer를 사용하는 경우, Hub(Control Plane)는 End User 계정관리를 제공한다.

스코프:
- End User 계정은 `project+env`에 속한다.
- 같은 이메일/아이디가 환경별로 분리될 수 있다.

권장 엔드포인트(스케치):
- `POST /endusers/signup` (optional)
- `POST /endusers/login` → Santokit access token(PASETO) + refresh token
- `POST /endusers/token` (refresh)
- `POST /endusers/logout` (refresh revoke)
  - (주의) Santokit access token이 PASETO인 경우 JWKS는 필요하지 않다.

외부 OIDC 연동(단일 플로우):
- `GET /oidc/:provider/start` (authorize redirect; project/env 선택 포함)
- `GET /oidc/:provider/callback` (code → token 교환, 검증, linking, 세션/쿠키 발급)

redirect 정책:
- 허용된 redirect URI allowlist를 `project+env` 스코프로 Hub에 저장한다.

저장 모델(최소):
- `end_users(id, project_id, env_id, email, password_hash, roles, status, created_at, updated_at)`
- `refresh_tokens(id, end_user_id, hash, expires_at, revoked_at, created_at)`

주의:
- End User 인증 UI(호스티드 로그인 페이지) 제공 여부는 별도 결정으로 둔다(필수 아님).

---

## 8) CLI Commands (Draft)

### 8.1 Operator Login (Control Plane)
- `stk login`
- `stk logout`
- `stk whoami`

### 8.2 API Key (Data Plane)
- `stk apikey create --project <project> --env <env> --name <name> --roles admin,writer,reader`
  - 출력(예시): `keyId=...` + `apiKey=...` (apiKey는 1회만)
- `stk apikey list --project <project> --env <env>`
  - 출력(예시): `keyId`, `name`, `roles`, `status`, `createdAt`, `lastUsedAt`
- `stk apikey revoke --project <project> --env <env> --key-id <keyId>`

권장 회전(무중단):
1) 새 키 생성: `stk apikey create ...`
2) 서버/CI에 새 키 배포
3) 구 키 폐기: `stk apikey revoke ...`
