# Auth (Hub-less) — Spec v1

목표:
- Hub가 없어도 프로젝트별로 인증/권한을 적용할 수 있어야 한다.
- “프로젝트별 배포(Option A)” 전제에서, 각 Bridge 배포 단위가 하나의 Auth 정책을 가진다.

핵심 원칙:
- Santokit은 “유저 DB/로그인 UI/세션 관리”를 제공하지 않는다.
- Bridge는 **외부 JWT issuer**(OIDC)에서 발급된 토큰을 **검증**하고, claim 기반으로 권한을 판단한다.

---

## 1) Runtime Modes

### Dev Mode
- `STK_DISABLE_AUTH=true`면 auth/permission 체크를 모두 우회한다.

### Enforced Mode
- `STK_DISABLE_AUTH=false`(default)면 아래 정책에 따라 검증한다.

---

## 2) Token Format

지원:
- JWT (JWS) only

토큰 전달:
- `Authorization: Bearer <jwt>`

---

## 3) Verification (OIDC/JWKS)

프로젝트(=Bridge 배포)별 설정 값:
- `STK_AUTH_ISSUER` (예: `https://issuer.example.com/`)
- `STK_AUTH_AUDIENCE` (optional, 있으면 aud 체크)
- `STK_AUTH_JWKS_URL` (optional, 없으면 `issuer + /.well-known/jwks.json` 규칙 사용)
- `STK_AUTH_REQUIRED` (`true|false`, default `false` for MVP)

검증 규칙(v1):
- signature 검증(JWKS)
- `iss` 체크(issuer 일치)
- `exp` 체크(만료)
- `aud`는 설정 시에만 체크

캐싱:
- JWKS는 캐시한다(메모리/Workers cache). TTL은 기본 10~60분 사이로 구현.

---

## 4) Claims Mapping (v1)

Bridge 내부 표준 claims (권한/CRUD/로직 auth에 사용):
- `sub` → `user.id`
- `role` 또는 `roles` → `user.roles: string[]`

설정으로 claim 키를 매핑 가능:
- `STK_AUTH_ROLE_CLAIM` (default: `roles`, fallback `role`)

---

## 5) How Logic Declares Auth

로직 메타(프론트매터 또는 twin metadata)에서:
- `auth: public` (default)
- `auth: authenticated`
- `auth: roles: [admin, ...]`

Bridge 처리:
- `public`: 토큰 없이 허용
- `authenticated`: 토큰 필요 + 검증 성공 필요
- `roles`: 검증 성공 + role 포함 필요

---

## 6) Project-Level Policy (Optional, v1)

`config/santokit.yaml`에서 프로젝트 기본 정책을 둘 수 있다(초안):
- `auth.default = public|authenticated`
- `auth.issuer/audience/jwksUrl/roleClaim`

단, secrets는 플랫폼 env로 주입이 원칙이므로
- config 파일에 issuer 같은 “비밀 아닌 설정”은 가능
- 실제 비밀은 env로 주입

---

## 7) Deploy Implications

프로젝트별 배포 모델에서:
- dev/prod는 서로 다른 Worker(또는 이미지)로 배포되므로
  - issuer/audience가 다르면 각 배포에 다른 env를 주입하면 된다.
  - secrets도 배포 단위로 분리된다.

