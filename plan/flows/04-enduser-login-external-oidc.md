# Flow 04 — End User: 외부 OIDC 로그인(Hub callback) → 통합(linking) → 쿠키/토큰 발급

목표:
- 외부 OIDC issuer가 여러 개인 환경에서, End User identity를 Hub(Control Plane)가 통합 관리한다.
- Bridge(Data Plane)는 외부 JWT를 직접 받지 않고, Santokit access token만 검증한다.

전제:
- 프로젝트에 외부 issuer들이 등록되어 있다(복수 가능).
- Hub는 account linking(issuer+sub → internal end_user_id)을 수행한다.

---

## A. 시작(start)

1) 앱이 Hub의 start 엔드포인트로 리다이렉트
- `GET /oidc/:provider/start?project=<project>&env=<env>&redirect_uri=<app_callback>`

Hub 동작:
- redirect_uri allowlist 검증
- state/nonce/PKCE 세션 생성
- 외부 IdP authorize URL로 302 redirect

---

## B. 콜백(callback)

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

## C. 앱으로 복귀(return)

3) Hub가 앱으로 redirect
- `302 Location: <redirect_uri>?code=<one_time_code>` (권장)

또는(SSR 편의):
- Hub가 HttpOnly 쿠키(`stk_access`, `stk_refresh`)를 설정하고 redirect

멀티 프로젝트 주의:
- 같은 Hub 도메인에서 여러 프로젝트를 동시에 로그인하려면 쿠키 격리가 필요하다.
  - 쿠키 네임스페이스: `stk_access_<project>_<env>`, `stk_refresh_<project>_<env>`

---

## D. 이후 호출

이후 End User는 다음 중 하나로 Bridge를 호출한다:
- `Authorization: Bearer <santokit_access_token>` (토큰 직접 사용)
- HttpOnly 쿠키 기반(Bridge가 쿠키에서 토큰 추출) — 구현 선택
