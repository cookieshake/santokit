# CRUD Flows

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

This flow verifies advanced CRUD operations and safety mechanisms that are not covered in the basic Flow 05.

목표:
Ensure that `update` and `delete` operations function correctly and that critical safety checks (like preventing operations without `where` clauses) are enforced.

Actors:
- **Operator**: Sets up the project and schema.
- **End User (Client)**: Performs CRUD operations via the Bridge.

---

### Steps

1.  **Setup**:
    - Operator creates a project and environment (`dev`).
    - Operator applies the `users` schema.
    - Operator creates an API Key with `admin` role.

2.  **Insert (Setup)**:
    - Client inserts a user record to act on.

3.  **Update**:
    - **Success Case**: Client updates the user's name using a specific `where` clause (ID).
    - **Verify**: Select the user to confirm the name change.
    - **Safety Check 1 (Empty Where)**: Client attempts to update with an empty `where` clause `{}`.
        - **Expectation**: Request fails (400 Bad Request). Bridge must refuse to update all rows.
    - **Safety Check 2 (Invalid Column)**: Client attempts to update a non-existent column.
        - **Expectation**: Request fails.

4.  **Delete**:
    - **Safety Check (Empty Where)**: Client attempts to delete with an empty `where` clause `{}`.
        - **Expectation**: Request fails (400 Bad Request). Bridge must refuse to delete all rows.
    - **Success Case**: Client deletes the user using a specific `where` clause (ID).
    - **Verify**: Select the user to confirm it no longer returns data.

---

## Flow 11 — CRUD Expand (Foreign Key Join)

This flow verifies the `expand` capability in CRUD `select` operations, allowing clients to fetch related records in a single request based on foreign key relationships defined in the schema.

목표:
Ensure that `select` operations can include nested objects for foreign key relationships when requested via the `expand` parameter.

Actors:
- **Operator**: Sets up the project and schema with relationships.
- **End User (Client)**: Performs `select` with `expand`.

---

### Steps

1.  **Setup**:
    - Operator creates a project and environment.
    - Operator applies a schema with `users` and `posts` tables.
        - `posts` has a foreign key `user_id` referring to `users.id`.
        - The reference defines `as: user` for the relationship name.
    - Operator creates an API Key.

2.  **Insert Data**:
    - Client inserts a user (User A).
    - Client inserts a post (Post 1) belonging to User A (`user_id` = User A's ID).

3.  **Select with Expand**:
    - Client performs a `select` on `posts` with `expand: ["user"]`.
    - **Verify**: The response includes the post fields *and* a `user` field containing User A's details (e.g., email).

4.  **Select without Expand (Control)**:
    - Client performs a `select` on `posts` *without* `expand`.
    - **Verify**: The response includes `user_id` but *not* the `user` object.

5.  **Invalid Expand (Safety Check)**:
    - Client requests an invalid relation name in `expand`.
    - **Verify**: The request fails (400 Bad Request).

---

## Flow 12 — CRUD Pagination & Sorting

This flow verifies the pagination and sorting capabilities of the `select` operation, including `orderBy`, `limit`, and `offset`.

목표:
Ensure that clients can sort results by specific columns (ascending/descending) and retrieve data in pages using limit/offset.

Actors:
- **Operator**: Sets up the project and schema.
- **End User (Client)**: Performs `select` operations with sorting and pagination parameters.

---

### Steps

1.  **Setup**:
    - Operator creates a project and environment.
    - Operator applies a schema (using `basic` fixture or similar with a `users` table).
    - Operator creates an API Key.

2.  **Insert Data**:
    - Client inserts multiple users (e.g., 5 users) with distinct fields (e.g., name A, B, C, D, E) to ensure deterministic sorting.

3.  **Sort Ascending**:
    - Client performs `select` with `orderBy: { name: "asc" }`.
    - **Verify**: Results are returned in A -> E order.

4.  **Sort Descending**:
    - Client performs `select` with `orderBy: { name: "desc" }`.
    - **Verify**: Results are returned in E -> A order.

5.  **Limit**:
    - Client performs `select` with `limit: 2` (default order or sorted).
    - **Verify**: Exactly 2 results are returned.

6.  **Offset**:
    - Client performs `select` with `orderBy: { name: "asc" }, limit: 2, offset: 2`.
    - **Verify**: Returns users C and D (skipping A and B).

7.  **Pagination (Limit + Offset)**:
    - Iterate through pages using limit/offset to retrieve all records.
