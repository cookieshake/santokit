# Auth — Spec v1 (Operator + End User)

목표:
- Santokit “사람 주체”를 두 종류로 분리해 모델링한다.
  - Operator: Hub(Control Plane)를 운영/관리하는 팀 멤버(사람)
  - End User: Bridge(Data Plane)의 `/call`을 호출하는 앱의 최종 사용자(사람)
- 웹 콘솔 없이 `stk`(CLI)로만 운영/관리 플로우가 가능해야 한다.

핵심 원칙:
- Control Plane은 “사용자 로그인 + 팀/프로젝트 RBAC”을 전제로 한다.
- Data Plane은 “프로젝트 API 키(서버/CI)” + “End User JWT(OIDC)”를 함께 지원한다.
- project/env 격리는 “라우팅”이 아니라 **검증된 credential**로 강제한다.

v1(Slim) 범위:
- Data Plane은 Project API Key만 필수로 지원한다.
- End User JWT(OIDC)는 Phase 2+로 미룬다.

---

## 1) Runtime Modes

### Dev Mode
- `STK_DISABLE_AUTH=true`면 auth/permission 체크를 모두 우회한다.

### Enforced Mode
- `STK_DISABLE_AUTH=false`(default)면 아래 정책에 따라 검증한다.

---

## 2) Operator Auth (Hub / Control Plane)

대상:
- `stk`가 호출하는 Hub API(프로젝트/환경/연결정보/키/권한/릴리즈 관리)

요구:
- Operator(사람)가 로그인할 수 있어야 한다.
- Hub(Control Plane)는 org/team/project 단위 RBAC을 가진다(예: org owner/admin/member).

v1 제안(웹 콘솔 없이):
- `stk login` → Hub에서 Control Plane access token 발급
- 토큰은 로컬 머신에 저장되고, `stk`가 Hub API 호출에 사용한다.

---

## 3) End User / Data Plane Auth (Bridge / Data Plane)

Bridge(`/call`)는 두 종류의 credential을 다룬다.

### 3.1 Project API Key (서버/CI)
요청 헤더(v1):
- `X-Santokit-Api-Key: <api_key>`

키 속성(v1):
- 스코프는 `project + env`에 바인딩된다. (예: `myproj:prod`)
- 키는 “keyId + secret” 형태이며, Hub는 평문 저장을 금지한다.
- 회전을 위해 최소 2개 동시 활성(또는 versioned) 모델을 지원한다.

권장 UX:
- `apiKey` 값은 생성 시 **1회만** 노출한다(재조회 불가).
- CLI는 `keyId`와 `apiKey`를 함께 출력한다.

### 3.2 End User JWT (OIDC)
요청 헤더(v1):
- `Authorization: Bearer <jwt>`

검증(v1):
- JWKS로 signature 검증
- `iss`/`exp` 체크
- `aud`는 설정 시에만 체크

표준 claims 매핑(v1):
- `sub` → `user.id`
- `roles` 또는 `role` → `user.roles: string[]`

---

## 4) Context Binding / Environment Isolation (필수)

### 4.1 Project API Key
- Bridge는 API key를 먼저 검증한다.
- key가 바인딩한 `project/env`를 **최종 요청 컨텍스트**로 설정한다.
- 요청이 `X-Santokit-Project`, `X-Santokit-Env`를 보내더라도 “라우팅 힌트”일 뿐이다.
- header의 `project/env`와 key의 `project/env`가 다르면 `403`으로 거부한다(헤더로 env 바꿔치기 불가).

### 4.2 End User JWT
- JWT는 “누가 호출했는지(user)”만 증명한다.
- `project/env`는 라우팅(Host 또는 header)로 결정되며,
  end-user token만으로 `project/env`를 바꿀 수 없도록 한다.

---

## 5) Roles / Permissions (v1, Data Plane)

권한 판단에 쓰는 roles의 출처:
- API key: key에 부여된 `roles`(예: `admin`, `writer`, `reader`)
- End-user JWT: 토큰 claims에서 파싱한 `user.roles`

Auto CRUD(Phase 5+) 권한 체크에 사용한다.

---

## 6) How Logic Declares Auth

로직 메타(프론트매터 또는 twin metadata)에서:
- `auth: public` (default)
- `auth: roles: [admin, ...]` (API key roles 또는 user.roles에 적용)

Bridge 처리:
- `public`: credential 없이 허용(권장하지 않음; 운영에서는 기본 비활성)
- `roles`: (API key 또는 JWT) 필요 + role 포함 필요

---

## 7) CLI Commands (v1, Draft)

### 7.1 Operator Login (Control Plane)
- `stk login`
- `stk logout`
- `stk whoami`

### 7.2 API Key (Data Plane)
- `stk apikey create --project <project> --env <env> --name <name> --roles admin,writer,reader`
  - 출력(예시): `keyId=...` + `apiKey=...` (apiKey는 1회만)
- `stk apikey list --project <project> --env <env>`
  - 출력(예시): `keyId`, `name`, `roles`, `status`, `createdAt`, `lastUsedAt`
- `stk apikey revoke --project <project> --env <env> --key-id <keyId>`

권장 회전(무중단):
1) 새 키 생성: `stk apikey create ...`
2) 서버/CI에 새 키 배포
3) 구 키 폐기: `stk apikey revoke ...`
