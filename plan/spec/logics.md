# Custom Logic (SQL Functions) — Spec

목표:
- Auto CRUD로 해결하기 어려운 복잡한 쿼리, 통계, 트랜잭션 처리를 지원한다.
- Bridge(Data Plane)는 정의된 SQL을 직접 실행한다.
- 파일 기반(`logics/*.sql`)으로 관리하며, `path`로 호출한다.

---

## 1) File Structure & Convention

- 경로: `logics/*.sql`
- Logic Name: 파일명(확장자 제외)이 로직 이름이 된다.
  - 예: `logics/stats_daily.sql` → `stats_daily`
  - 하위 폴더 지원: `logics/admin/users.sql` → `admin/users`

파일 포맷:
- **Frontmatter (YAML)**: 메타데이터(권한, 파라미터 정의 등)
- **Body (SQL)**: 실행할 SQL 쿼리

Frontmatter 필드(핵심):
- `auth`: `public` | `authenticated` (default: `authenticated`)
- `roles`: 허용 role 리스트(선택)
- `params`: 파라미터 타입/기본값 정의(선택)
- `connection`: 실행할 DB connection 이름(선택, default: `main`)
  - Bridge는 로직별 `connection` 값을 읽어 해당 connection pool에서 SQL을 실행한다.

예시 (`logics/purchase_item.sql`):
```sql
---
description: "아이템 구매 트랜잭션"
auth: authenticated
params:
  itemId: { type: string, required: true }
  qty: { type: int, default: 1 }
---
BEGIN;

-- 1. 재고 차감
UPDATE items 
SET stock = stock - :qty 
WHERE id = :itemId AND stock >= :qty;

-- 2. 구매 기록
INSERT INTO purchases (user_id, item_id, qty, created_at)
VALUES (:auth.sub, :itemId, :qty, NOW());

COMMIT;
```

---

## 2) Runtime API (`POST /call`)

호출 인터페이스:
```json
{
  "path": "logics/purchase_item",
  "params": {
    "itemId": "item_123",
    "qty": 2
  }
}
```

처리 흐름:
1. `path`가 `logics/`로 시작하면 Custom Logic으로 라우팅.
2. 해당 SQL 파일 로드 (Hub 릴리즈에 포함됨).
3. **Auth & Permissions 검증** (Frontmatter `auth`/`roles` 기준).
4. **Parameter Validation**: 정의된 타입/필수 여부 체크.
5. **SQL Parameter Binding**: 입력 파라미터(`:param`) 치환.
   - `request.auth.sub` 같은 시스템 변수도 바인딩 가능 (`:auth.sub`).
6. Frontmatter의 `connection`(기본 `main`)에 해당하는 pool에서 SQL 실행.
7. 결과 형식 규칙에 맞춰 응답 반환.

응답 형식:
- Row 반환 쿼리(`SELECT`, `RETURNING` 포함): `{"data": {"data": [...]}}`
- Execute-only 쿼리(행 반환 없음): `{"data": {"affected": N}}`

---

## 3) Permissions & Security

Frontmatter (`--- ... ---`):
- `auth`: `public` | `authenticated` (default: `authenticated`)
- `roles`: 허용된 role 리스트 (OR 조건)
  - 예: `roles: [admin, manager]`

주의(현재 구현):
- Bridge의 공통 인증 게이트웨이는 credential(API key 또는 End User token)을 요구한다.
- 따라서 `auth: public`은 "추가 인증 요구 없음"을 의미하며, 완전 익명 호출을 의미하지 않는다.

변수 바인딩 (System Context):
- `:auth.sub`: 현재 로그인한 유저 ID
- `:auth.roles`: 유저 Role (JSON/Array)
- `:client.ip`: 클라이언트 IP 등

SQL Injection 방지:
- 절대 문자열 치환(String Interpolation)을 하지 않는다.
- DB 드라이버의 **Parameter Binding** 기능(`$1`, `?` 등)만 사용한다.
- Bridge는 `:paramName`을 해당 드라이버 문법으로 변환하여 실행한다.

---

## 4) Limitation

- 기본적으로 **Raw SQL**이므로 DB 엔진에 종속적이다.
- 복잡한 로직(분기 처리, 루프 등)은 DB의 stored procedure(PL/pgSQL 등)를 호출하거나, SQL 내에서 해결해야 한다.
- JavaScript/Python 스크립트 실행은 지원하지 않는다(보안/성능 이슈).

---

## 5) Transaction & Error Handling

명시적 트랜잭션:
- SQL 본문에 `BEGIN;` ... `COMMIT;` 또는 `ROLLBACK;`을 포함할 수 있음
- Bridge는 SQL을 있는 그대로 실행 (트랜잭션 블록 포함)
- Multi-statement 실행 지원

암묵적 트랜잭션:
- 단일 statement는 DB 드라이버의 기본 트랜잭션 정책 따름 (보통 auto-commit)

에러 처리:
- SQL 실행 실패 시 Bridge는 에러를 캐치하고 `500 INTERNAL_ERROR` 반환
- 에러 메시지는 로그에만 기록 (클라이언트에는 일반 에러 메시지)
- 보안: SQL 에러 세부사항을 클라이언트에 노출하지 않음

Timeout:
- Logic 실행은 Bridge의 전역 timeout 설정을 따름
- 장시간 실행 쿼리는 타임아웃 후 자동 취소

Connection Pooling:
- Logic은 해당 connection의 pool에서 connection 획득
- 실행 완료 후 자동 반환
