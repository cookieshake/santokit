# Auth — Spec (Operator + End User)

목표:
- Operator(Hub Control Plane) 인증/권한과 End User(Bridge Data Plane) 인증을 분리해 정의한다.
- End User는 built-in email/password + 외부 OIDC provider(여러 개) 로그인을 지원한다.
- End User account linking(여러 identity를 하나의 End User로 통합)은 v0에서 **명시적 링크**만 지원한다(자동 링크 금지).

핵심 원칙:
- project/env 격리는 “라우팅”이 아니라 **검증된 credential**로 강제한다.
- Bridge는 `/call` 처리에서 access token을 **오프라인 검증**한다(Hub 조회 없이 인가).
- Hub는 End User 인증 API(OIDC/callback/linking 포함)에서 토큰을 발급/갱신/폐기하며, 필요한 경우 토큰을 검증한다.

---

## 1) Runtime Modes

### Dev Mode
- `STK_DISABLE_AUTH=true`면 auth/permission 체크를 모두 우회한다.

### Enforced Mode
- `STK_DISABLE_AUTH=false`(default)면 아래 정책에 따라 검증한다.

---

## 2) Operator Accounts & Auth (Hub / Control Plane)

대상:
- `stk`가 호출하는 Hub API(프로젝트/환경/연결정보/키/권한/릴리즈 등)

요구(최소):
- Operator(사람)가 로그인할 수 있어야 한다.
- Hub는 org/project 범위의 Operator RBAC을 평가한다.

계정관리(필수):
- 비밀번호는 `argon2id` 또는 `bcrypt`로 해시 저장한다(평문 저장 금지).

---

## 3) End User Auth (Hub issuer + Bridge verifier)

End User는 아래 identity를 가질 수 있다:
- built-in password: `email + password`
- 외부 OIDC: `provider + subject`

### 3.1 Santokit Access Token (Bridge-Verified)

형식(권장):
- PASETO `v4.local` (대칭키 암호화)

토큰 최소 claims:
- `sub`: End User ID (정규화된 ID)
- `projectId`, `envId`
- `roles: string[]`
- `iat`, `exp`
- `jti` (revocation/log correlation 등)

검증:
- Bridge는 `exp`와 `project/env` 바인딩을 검증한다.

키 관리/로테이션:
- 토큰 헤더에 `kid`를 포함한다.
- Bridge는 “현재 키 + 이전 키(들)”을 로딩해 검증한다.
- 키 소재 동기화: `plan/spec/bridge-hub-protocol.md`의 `GET /internal/keys/{project}/{env}`

### 3.2 Refresh Token (Hub-Verified)

- refresh token은 opaque(랜덤)으로 발급하고 Hub에 **해시로 저장**한다.
- Bridge는 refresh를 처리하지 않는다.

### 3.3 Token Transport (Bearer + SSR Cookie)

Hub End User API와 Bridge `/call`은 둘 다 아래 입력을 허용한다.

Bearer:
- `Authorization: Bearer <stk_access_token>`

SSR cookies:
- `stk_access_<project>_<env>=<stk_access_token>` (HttpOnly)
- `stk_refresh_<project>_<env>=<refresh_token>` (HttpOnly)

쿠키 네임스페이스(결정):
- 여러 프로젝트/환경을 한 Hub 도메인에서 다루기 위해 쿠키 이름에 `project/env`를 포함한다.

---

## 4) Built-in Email/Password (Hub)

권장 엔드포인트(스케치):
- `POST /endusers/signup`
- `POST /endusers/login`
- `POST /endusers/token` (refresh)
- `POST /endusers/logout` (refresh revoke)

v0 제약:
- 이메일 verification은 제공하지 않는다.

---

## 5) External OIDC Providers (Hub)

지원:
- 여러 OIDC provider를 `project+env` 스코프로 등록한다.
- Hub가 callback을 처리하고, Santokit access/refresh를 발급한다.

중요:
- 외부 OIDC JWT를 Bridge `/call`에 그대로 보내는 방식은 지원하지 않는다.
- Bridge가 검증하는 것은 Santokit access token이다.

### 5.1 Provider Configuration (개념)

- `providerName`: 예) `google`, `github`, `okta`
- `issuer`
- `clientId`, `clientSecret`
- `scopes`
- `redirectUriAllowlist[]`
- (선택) roles mapping 규칙(최소) — claim에서 roles를 읽어오되, 없으면 기본 role을 사용

### 5.2 OIDC Endpoints (login/link 공통)

브라우저 리다이렉트 기반 플로우를 “exchange code”로 정규화한다.

1) Start
- `GET /oidc/:provider/start?mode=login|link&project=...&env=...&redirect_uri=...`
  - `mode=link`는 **End User 세션 필요**(cookie 또는 bearer)

2) Callback
- `GET /oidc/:provider/callback?...`
  - Hub가 code → token 교환, id_token 검증, subject 추출까지 수행
  - 결과로 **1회용 exchange_code**를 생성한다(짧은 TTL)
  - `redirect_uri`로 302 redirect 하며, exchange_code를 전달한다(쿼리 또는 fragment)

3) Exchange
- `POST /oidc/:provider/exchange`
  - 입력: `{ "exchange_code": "..." }`
  - `mode=login`: 세션 없이 허용(새 세션 발급)
  - `mode=link`: **현재 End User 세션 필요**(cookie 또는 bearer)

---

## 6) Account Linking (Explicit Only, v0)

목표:
- 여러 identity(password/OIDC)를 하나의 End User로 묶는다.

원칙(v0):
- 자동 링크(예: 동일 email로 자동 merge/attach)는 제공하지 않는다.
- linking은 반드시 “현재 로그인된 End User”에 attach하는 **명시적 동작**이다.

### 6.1 Linking via OIDC

- `GET /oidc/:provider/start?mode=link ...`
- `POST /oidc/:provider/exchange` (mode=link)
  - 성공 시: 현재 End User에 `{provider, subject}` identity를 추가
  - 충돌 시: `409 CONFLICT` (이미 다른 End User에 연결됨)

### 6.2 Linking Password Identity

권장 엔드포인트(스케치):
- `POST /endusers/password/set`
  - 현재 End User 세션 필요(cookie 또는 bearer)
  - 충돌 시: `409 CONFLICT`

---

## 7) Context Binding / Environment Isolation (필수)

Bridge는 credential이 여러 개 들어와도 아래 우선순위로 단일 컨텍스트를 확정한다.

| 순서 | 입력 | 동작 |
|---|---|---|
| 1 | `X-Santokit-Api-Key` | API key를 사용한다. key의 `project/env`가 최종 컨텍스트다. |
| 2 | `Authorization: Bearer <token>` | API key가 없을 때만 사용한다. token의 `projectId/envId`를 검증한다. |
| 3 | `stk_access_<project>_<env>` 쿠키 | 1,2가 없을 때만 사용한다. 먼저 요청의 `project/env`를 결정한 뒤 해당 네임스페이스 쿠키를 읽는다. |

에러 규칙:
- credential이 하나도 없으면 `401`.
- API key 또는 token의 바인딩과 라우팅 힌트(`X-Santokit-Project`, `X-Santokit-Env`)가 불일치하면 `403`.

---

## 8) Security Notes (필수)

민감정보 로그 금지:
- access/refresh token 값, API key 값, service token 값, DB URL, `/internal/keys` 응답의 키 소재는 로그/트레이스에 남기지 않는다.

상세 규칙:
- 내부 API 민감정보 필터링: `plan/spec/bridge-hub-protocol.md` Section 1.1.1
- 전체 보안 규칙: `plan/flows/security.md`
