# Authentication Flows

## Flow 03 — End User: Hub 내장 계정 로그인(issuer) → 쿠키/토큰 발급(SSR 포함)

목표:
- End User가 Hub(Control Plane)의 내장 계정관리로 로그인하고,
  Bridge(Data Plane)에서 검증 가능한 "암호화된 Santokit access token(PASETO v4.local)"을 얻는다.

전제:
- 프로젝트가 "Hub issuer 모드"로 설정되어 있다.
- End User 계정은 `project+env` 스코프에 속한다(프로젝트별로 분리).

---

### A. 회원가입(선택)

- `POST /endusers/signup`

요청(예시):
```json
{ "email": "a@example.com", "password": "..." }
```

---

### B. 로그인

- `POST /endusers/login`

요청(예시):
```json
{ "project": "<project>", "env": "<env>", "email": "a@example.com", "password": "..." }
```

응답(예시):
```json
{
  "accessToken": "<paseto_v4_local>",
  "refreshToken": "<opaque>"
}
```

특징:
- `accessToken`은 클라이언트가 payload를 읽을 수 없다(암호화).
- `accessToken`에는 `roles`가 포함된다.

SSR 쿠키 모드(옵션):
- Hub는 access/refresh token을 HttpOnly 쿠키로도 발급할 수 있다.
  - 예: `Set-Cookie: stk_access_<project>_<env>=<paseto>; HttpOnly; Secure; SameSite=Lax; Path=/`
  - 예: `Set-Cookie: stk_refresh_<project>_<env>=<opaque>; HttpOnly; Secure; SameSite=Lax; Path=/`
- 이 경우 응답 body에 토큰을 포함하지 않고 `204` 또는 최소 JSON으로 응답할 수 있다.

멀티 프로젝트 주의(쿠키 네임스페이스):
- 같은 Hub 도메인에서 여러 프로젝트를 동시에 로그인하려면 쿠키 이름을 `project/env`로 네임스페이스한다.
  - 예: `stk_access_<project>_<env>`, `stk_refresh_<project>_<env>`

---

### C. 갱신(Refresh)

- `POST /endusers/token`

요청(예시):
```json
{ "refreshToken": "<opaque>" }
```

응답:
- 새 `accessToken` + (선택) 새 `refreshToken`

SSR 쿠키 모드(옵션):
- refresh 성공 시 새 `stk_access_<project>_<env>`(및 필요 시 `stk_refresh_<project>_<env>`) 쿠키를 재설정한다.

---

### D. 로그아웃(Refresh 폐기)

- `POST /endusers/logout`

요청(예시):
```json
{ "refreshToken": "<opaque>" }
```

SSR 쿠키 모드(옵션):
- Hub는 `stk_access_<project>_<env>`, `stk_refresh_<project>_<env>` 쿠키를 만료 처리한다.

---

## Flow 04 — End User: 외부 OIDC 로그인(Hub callback) → 통합(linking) → 쿠키/토큰 발급

목표:
- 외부 OIDC issuer가 여러 개인 환경에서, End User identity를 Hub(Control Plane)가 통합 관리한다.
- Bridge(Data Plane)는 외부 JWT를 직접 받지 않고, Santokit access token만 검증한다.

전제:
- 프로젝트에 외부 issuer들이 등록되어 있다(복수 가능).
- Hub는 account linking(issuer+sub → internal end_user_id)을 수행한다.

---

### A. 시작(start)

1) 앱이 Hub의 start 엔드포인트로 리다이렉트
- `GET /oidc/:provider/start?project=<project>&env=<env>&redirect_uri=<app_callback>`

Hub 동작:
- redirect_uri allowlist 검증
- state/nonce/PKCE 세션 생성
- 외부 IdP authorize URL로 302 redirect

---

### B. 콜백(callback)

2) 외부 IdP가 Hub callback으로 redirect
- `GET /oidc/:provider/callback?code=...&state=...`

Hub 동작:
- state/nonce/PKCE 검증
- code → token 교환
- 외부 토큰 검증
- `issuer+sub` → internal end_user_id로 linking/정규화
- End User roles 로딩/계산
- Santokit access/refresh token 발급
  - access token: PASETO v4.local
  - refresh token: opaque(랜덤; Hub 저장은 해시)

---

### C. 앱으로 복귀(return)

3) Hub가 앱으로 redirect
- `302 Location: <redirect_uri>?code=<one_time_code>` (권장)

또는(SSR 편의):
- Hub가 HttpOnly 쿠키(`stk_access_<project>_<env>`, `stk_refresh_<project>_<env>`)를 설정하고 redirect

멀티 프로젝트 주의:
- 같은 Hub 도메인에서 여러 프로젝트를 동시에 로그인하려면 쿠키 격리가 필요하다.
  - 쿠키 네임스페이스: `stk_access_<project>_<env>`, `stk_refresh_<project>_<env>`

---

### D. 이후 호출

이후 End User는 다음 중 하나로 Bridge를 호출한다:
- `Authorization: Bearer <santokit_access_token>` (토큰 직접 사용)
- HttpOnly 쿠키 기반(Bridge가 쿠키에서 토큰 추출) — 구현 선택

---

## Flow 09 — End User: 같은 Hub에서 여러 프로젝트 로그인(쿠키 네임스페이스)

목표:
- 같은 Hub(Control Plane)에서 End User가 여러 `project/env`에 로그인할 수 있어야 한다.
- 각 `project/env` 세션(쿠키)이 서로 덮어쓰지 않아야 한다.
- Bridge(Data Plane)는 요청 컨텍스트의 `project/env`에 맞는 access token 쿠키를 선택해 검증해야 한다.

전제:
- Hub issuer 모드(내장 계정 또는 외부 OIDC callback)로 End User access token(PASETO v4.local)을 발급한다.
- 쿠키 모드가 활성화되어 있다(HttpOnly).
- 쿠키 네임스페이스 규칙:
  - `stk_access_<project>_<env>`
  - `stk_refresh_<project>_<env>`

---

### A. 프로젝트 A 로그인(쿠키 발급)

1) Hub 로그인 요청(예: 내장 계정)
- `POST /endusers/login`

요청 예시:
```json
{ "project": "projA", "env": "dev", "email": "a@example.com", "password": "..." }
```

기대 결과:
- 응답에 `Set-Cookie: stk_access_projA_dev=...; HttpOnly; ...`
- 응답에 `Set-Cookie: stk_refresh_projA_dev=...; HttpOnly; ...`

---

### B. 프로젝트 B 로그인(쿠키 추가 발급)

2) Hub 로그인 요청(동일 브라우저 세션)
- `POST /endusers/login`

요청 예시:
```json
{ "project": "projB", "env": "dev", "email": "a@example.com", "password": "..." }
```

기대 결과:
- `stk_access_projB_dev`, `stk_refresh_projB_dev` 쿠키가 추가로 설정된다.
- `stk_access_projA_dev`, `stk_refresh_projA_dev` 쿠키는 유지된다(덮어쓰기 금지).

---

### C. Bridge 호출(프로젝트 A)

3) Bridge CRUD 호출
- `POST /call`
- headers:
  - `X-Santokit-Project: projA`
  - `X-Santokit-Env: dev`

body 예시:
```json
{ "path": "db/users/select", "params": { "where": { "id": "..." }, "limit": 1 } }
```

기대 결과:
- Bridge는 `stk_access_projA_dev` 쿠키를 선택해 access token을 검증한다.
- 토큰의 `project/env` 바인딩이 `projA/dev`가 아니면 `403`.

---

### D. Bridge 호출(프로젝트 B)

4) Bridge CRUD 호출
- `POST /call`
- headers:
  - `X-Santokit-Project: projB`
  - `X-Santokit-Env: dev`

기대 결과:
- Bridge는 `stk_access_projB_dev` 쿠키를 선택해 access token을 검증한다.

---

### E. 프로젝트 A 로그아웃(토큰 폐기)

5) Hub 로그아웃
- `POST /endusers/logout`

요청 예시:
```json
{ "refreshToken": "<opaque>" }
```

기대 결과:
- `stk_access_projA_dev`, `stk_refresh_projA_dev` 쿠키만 만료/삭제된다.
- `stk_access_projB_dev`, `stk_refresh_projB_dev`는 유지된다.
- 쿠키 모드에서는 요청 바디 대신 `stk_refresh_projA_dev` 쿠키에서 refresh token을 읽어 처리할 수 있다.

---

## 공통 완료 기준 템플릿

각 Flow는 아래 기준을 최소 포함하도록 유지한다.
- 요청 예시: 경로/헤더/바디(또는 쿠키) 중 핵심 입력값 1개 이상 제시
- 성공 기준: 기대 상태코드와 핵심 응답 필드 제시
- 실패 기준: 최소 1개 부정 케이스와 기대 에러코드 제시
