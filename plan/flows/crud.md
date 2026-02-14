# CRUD Flows

번호 규칙:
- Flow 번호는 카테고리 간 전역 번호를 공유한다.
- 번호 결번은 기존 합의/삭제 이력으로 유지할 수 있다.

## Flow 05 — End User: CRUD 호출(Bridge `/call`) + 권한/owner 적용

목표:
- End User가 Bridge(Data Plane) `/call`로 Auto CRUD를 호출한다.

전제:
- End User가 Santokit access token(PASETO v4.local)을 가지고 있다.
- 대상 `project+env`에 릴리즈가 존재한다(permissions + schema IR).

---

### A. 요청 구성

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

### B. Bridge의 처리(요약)

1) access token 복호화/검증(만료, `project/env` 바인딩 포함)
2) 현재 릴리즈 로드(permissions + schema IR)
3) `path` 해석 및 스키마/권한 검증
4) where 표현식 검증 및 SQL 생성(바인딩 파라미터)
5) owner 정책이면 row filter 강제
6) DB 실행 후 결과 반환

---

### C. 권한 실패 예시

- 허용되지 않은 op/테이블/컬럼이면 `403`
- 라우팅 힌트의 `project/env`와 토큰 `project/env`가 다르면 `403`

---

## Flow 10 — Advanced CRUD & Safety

목표:
- Flow 05에서 다루지 않은 고급 CRUD 동작과 안전장치를 검증한다.
- 특히 `update/delete`에서 대량 변경을 막는 기본 안전 규칙(`where` 필수)을 확인한다.

---

### 단계

1) **준비**
   - Operator가 프로젝트/환경(`dev`)을 생성한다.
   - `users` 스키마를 적용한다.
   - `admin` role API key를 발급한다.

2) **사전 데이터 삽입**
   - Client가 대상 사용자 row를 1개 insert한다.

3) **Update 검증**
   - 성공 케이스: `where: { id: ... }`로 이름을 수정한다.
   - 검증: select로 변경된 값을 확인한다.
   - 안전장치 1: 빈 `where` (`{}`)로 update를 시도하면 `400 BAD_REQUEST`여야 한다.
   - 안전장치 2: 존재하지 않는 컬럼 update 시도는 실패해야 한다.

4) **Delete 검증**
   - 안전장치: 빈 `where` (`{}`) delete는 `400 BAD_REQUEST`여야 한다.
   - 성공 케이스: `where: { id: ... }`로 delete한다.
   - 검증: 재조회 시 결과가 없어야 한다.

---

## Flow 11 — CRUD Expand (Foreign Key Join)

목표:
- `select`의 `expand` 파라미터를 통해 FK 연관 row를 한 번에 조회할 수 있는지 확인한다.

---

### 단계

1) **준비**
   - Operator가 프로젝트/환경을 생성한다.
   - `users`, `posts`가 포함된 스키마를 적용한다.
     - `posts.user_id`는 `users.id`를 참조한다.
     - `references.as: user`를 선언한다.
   - API key를 발급한다.

2) **데이터 삽입**
   - Client가 User A를 insert한다.
   - Client가 User A 소유의 Post 1을 insert한다.

3) **expand 조회**
   - `posts` select에 `expand: ["user"]`를 넣어 호출한다.
   - 검증: 응답에 post 필드와 함께 `user` 객체가 포함되어야 한다.

4) **비교군 조회(미사용)**
   - `expand` 없이 `posts` select를 호출한다.
   - 검증: `user_id`는 있으나 `user` 객체는 없어야 한다.

5) **잘못된 expand 검증**
   - 존재하지 않는 relation 이름을 `expand`에 넣는다.
   - 검증: `400 BAD_REQUEST`로 실패해야 한다.

---

## Flow 12 — CRUD Pagination & Sorting

목표:
- `select`의 정렬/페이지네이션 파라미터(`orderBy`, `limit`, `offset`) 동작을 검증한다.

---

### 단계

1) **준비**
   - Operator가 프로젝트/환경을 생성한다.
   - `users` 테이블이 포함된 스키마를 적용한다.
   - API key를 발급한다.

2) **데이터 삽입**
   - Client가 정렬 검증이 가능한 5개 이상의 사용자(row)를 넣는다(예: name A~E).

3) **오름차순 정렬**
   - `orderBy: { name: "asc" }`로 호출한다.
   - 검증: 결과가 A → E 순서여야 한다.

4) **내림차순 정렬**
   - `orderBy: { name: "desc" }`로 호출한다.
   - 검증: 결과가 E → A 순서여야 한다.

5) **limit 검증**
   - `limit: 2`로 호출한다.
   - 검증: 결과 개수는 정확히 2건이어야 한다.

6) **offset 검증**
   - `orderBy: { name: "asc" }, limit: 2, offset: 2`로 호출한다.
   - 검증: A/B를 건너뛴 C/D가 반환되어야 한다.

7) **페이지 순회 검증**
   - `limit + offset` 조합으로 여러 페이지를 순회해 전체 row를 누락 없이 수집한다.

---

## 공통 완료 기준 템플릿

각 Flow는 아래 기준을 최소 포함하도록 유지한다.
- 요청 예시: path/params/headers(또는 credential) 중 핵심 입력값 1개 이상 제시
- 성공 기준: 기대 상태코드와 핵심 응답 형태 제시
- 실패 기준: 최소 1개 부정 케이스와 기대 에러코드 제시
