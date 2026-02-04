# Flow 09 — End User: 같은 Hub에서 여러 프로젝트 로그인(쿠키 네임스페이스)

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

## A. 프로젝트 A 로그인(쿠키 발급)

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

## B. 프로젝트 B 로그인(쿠키 추가 발급)

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

## C. Bridge 호출(프로젝트 A)

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

## D. Bridge 호출(프로젝트 B)

4) Bridge CRUD 호출
- `POST /call`
- headers:
  - `X-Santokit-Project: projB`
  - `X-Santokit-Env: dev`

기대 결과:
- Bridge는 `stk_access_projB_dev` 쿠키를 선택해 access token을 검증한다.

---

## E. 프로젝트 A 로그아웃(토큰 폐기)

5) Hub 로그아웃
- `POST /endusers/logout`

요청 예시:
```json
{ "project": "projA", "env": "dev" }
```

기대 결과:
- `stk_access_projA_dev`, `stk_refresh_projA_dev` 쿠키만 만료/삭제된다.
- `stk_access_projB_dev`, `stk_refresh_projB_dev`는 유지된다.
