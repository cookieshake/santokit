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
6. SQL 실행 및 결과 반환.

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
