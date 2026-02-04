# Flow 03 — End User: Hub 내장 계정 로그인(issuer) → 쿠키/토큰 발급(SSR 포함)

목표:
- End User가 Hub(Control Plane)의 내장 계정관리로 로그인하고,
  Bridge(Data Plane)에서 검증 가능한 “암호화된 Santokit access token(PASETO v4.local)”을 얻는다.

전제:
- 프로젝트가 “Hub issuer 모드”로 설정되어 있다.
- End User 계정은 `project+env` 스코프에 속한다(프로젝트별로 분리).

---

## A. 회원가입(선택)

- `POST /endusers/signup`

요청(예시):
```json
{ "email": "a@example.com", "password": "..." }
```

---

## B. 로그인

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
  - 예: `Set-Cookie: stk_access=<paseto>; HttpOnly; Secure; SameSite=Lax; Path=/`
  - 예: `Set-Cookie: stk_refresh=<opaque>; HttpOnly; Secure; SameSite=Lax; Path=/`
- 이 경우 응답 body에 토큰을 포함하지 않고 `204` 또는 최소 JSON으로 응답할 수 있다.

멀티 프로젝트 주의(쿠키 네임스페이스):
- 같은 Hub 도메인에서 여러 프로젝트를 동시에 로그인하려면 쿠키 이름을 `project/env`로 네임스페이스한다.
  - 예: `stk_access_<project>_<env>`, `stk_refresh_<project>_<env>`

---

## C. 갱신(Refresh)

- `POST /endusers/token`

요청(예시):
```json
{ "refreshToken": "<opaque>" }
```

응답:
- 새 `accessToken` + (선택) 새 `refreshToken`

SSR 쿠키 모드(옵션):
- refresh 성공 시 새 `stk_access`(및 필요 시 `stk_refresh`) 쿠키를 재설정한다.

---

## D. 로그아웃(Refresh 폐기)

- `POST /endusers/logout`

요청(예시):
```json
{ "refreshToken": "<opaque>" }
```

SSR 쿠키 모드(옵션):
- Hub는 `stk_access`, `stk_refresh` 쿠키를 만료 처리한다.
