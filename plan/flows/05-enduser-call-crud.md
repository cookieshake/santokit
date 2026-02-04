# Flow 05 — End User: CRUD 호출(Bridge `/call`) + 권한/owner 적용

목표:
- End User가 Bridge(Data Plane) `/call`로 Auto CRUD를 호출한다.

전제:
- End User가 Santokit access token(PASETO v4.local)을 가지고 있다.
- 대상 `project+env`에 릴리즈가 존재한다(permissions + schema IR).

---

## A. 요청 구성

요청:
- `POST /call`
- `Authorization: Bearer <santokit_access_token>`
- (라우팅 힌트) `X-Santokit-Project: <project>`
- (라우팅 힌트) `X-Santokit-Env: <env>`

Body(예시):
```json
{
  "path": "db/users/select",
  "params": { "where": { "id": "user_..." }, "limit": 1 }
}
```

멀티 DB:
- `path`는 `db/<table>/<op>` 형태다.
- 각 table이 어떤 DB(connection)에 속하는지는 선언 스키마(`schema/*.yaml`)에서 결정된다.

---

## B. Bridge의 처리(요약)

1) access token 복호화/검증(만료, `project/env` 바인딩 포함)
2) 현재 릴리즈 로드(permissions + schema IR)
3) `path` 해석 및 스키마/권한 검증
4) where 표현식 검증 및 SQL 생성(바인딩 파라미터)
5) owner 정책이면 row filter 강제
6) DB 실행 후 결과 반환

---

## C. 권한 실패 예시

- 허용되지 않은 op/테이블/컬럼이면 `403`
- 라우팅 힌트의 `project/env`와 토큰 `project/env`가 다르면 `403`
