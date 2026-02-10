# 커스텀 로직 플로우

## Flow 15 — Custom Logic 호출 (`/call`)

### 개요
파일 기반 SQL 로직(`logics/*.sql`)을 `/call` 엔드포인트로 실행하는 흐름을 검증한다.

### 픽스처: `logics_call`
- **스키마**: `items` 테이블(`id`, `name`, `price`, `owner_id`)
- **권한**: 인증된 사용자에게 CRUD 허용
- **로직**:
  - `whoami.sql`: 시스템 변수 `:auth.sub` 반환
  - `get_items.sql`: 필수 파라미터 `owner_id`를 받는 조회
  - `insert_item.sql`: `RETURNING` 없는 실행 전용 INSERT
  - `public_hello.sql`: `auth: public` 로직
  - `admin_only.sql`: 역할 제한 로직(`roles: [admin]`)
  - `default_params.sql`: 기본값이 있는 파라미터

---

### 테스트 시나리오

#### B1: whoami — 시스템 변수 접근
**목적**: `:auth.sub`가 요청 사용자 기준으로 주입되는지 검증

**절차**:
1. 인증 사용자로 `whoami` 로직 호출
2. 응답의 `data.data[0].sub`가 사용자 ID와 일치하는지 확인

**기대 결과**:
- 상태코드: 200
- 응답: `{"data": {"data": [{"sub": "<user_id>"}]}}`

---

#### B2: public_hello — Public Auth 로직
**목적**: `auth: public` 로직의 호출 동작 검증

**주의**: 로직이 `auth: public`이어도 Bridge 공통 인증 게이트웨이에서 credential을 요구하므로 인증 사용자로 호출한다.

**절차**:
1. 인증 사용자로 `public_hello` 호출
2. 인사 메시지 응답 확인

**기대 결과**:
- 상태코드: 200
- 응답: `{"data": {"data": [{"greeting": "hello"}]}}`

---

#### B3: insert_item — 실행 전용 로직
**목적**: 실행 전용 쿼리(INSERT without RETURNING)의 응답 형식 검증

**절차**:
1. 필수 파라미터를 포함해 `insert_item` 호출
2. 실행 전용 응답 형식 확인
3. CRUD API로 실제 삽입 여부 확인

**기대 결과**:
- 상태코드: 200
- 응답: `{"data": {"affected": 1}}`

---

#### B4: get_items — 필수 파라미터 바인딩
**목적**: 필수 파라미터 검증 및 SQL injection 방지 동작 검증

**절차**:
1. `owner_id`를 넣어 `get_items` 호출
2. WHERE 필터링이 올바르게 적용되는지 확인
3. 매칭 행이 없을 때 빈 결과인지 확인

**기대 결과**:
- 상태코드: 200
- 응답: `{"data": {"data": []}}` (초기 상태)

---

#### B5: default_params — 파라미터 기본값
**목적**: 기본값 적용(전체 기본값, 부분 override, 전체 override) 검증

**절차**:
1. 파라미터 없이 호출 → 기본값 2개 모두 적용
2. `greeting`만 호출 → `count` 기본값 1 적용
3. 두 파라미터 모두 전달 → 기본값 미사용

**기대 결과**:
- 모든 호출이 상태코드 200
- 각 케이스별 파라미터 반영값이 응답에 정확히 나타남

---

#### B6: admin_only — 역할 기반 접근 제어
**목적**: 로직의 role 제한 적용 검증

**절차**:
1. End User(role: `user`)로 `admin_only` 호출 → 403
2. API key(role: `admin`)로 `admin_only` 호출 → 200

**기대 결과**:
- End User: 403 Forbidden
- API key: 200, count 결과 반환

---

#### B7: 오류 케이스
**목적**: 공통 실패 시나리오의 에러 처리 검증

**테스트 케이스**:
1. **필수 파라미터 누락**: `owner_id` 없이 `get_items` 호출 → 400
2. **로직 없음**: 존재하지 않는 로직 호출 → 404
3. **미인증**: credential 없이 호출 → 401
4. **파라미터 타입 불일치**: `owner_id`에 숫자 전달 → 400

**기대 에러 메시지**:
- `"Missing required param: owner_id"`
- `"Logic not found: nonexistent"`
- `"Insufficient roles"` (role 불일치)
- `"Invalid type for param: owner_id"` (타입 불일치)

---

### 구현 메모

#### 응답 형식
- **행 반환 쿼리**: `{"data": {"data": [...]}}`
- **실행 전용 쿼리**: `{"data": {"affected": N}}`

#### 인증/인가
- End User 기본 role: `["user"]`
- API key role: CLI에서 `--roles admin` 등으로 설정
- `auth: public`은 추가 role 제한이 없다는 의미이며, 공통 인증 게이트웨이 요구는 유지됨

#### 파라미터 해석 순서
1. 필수 파라미터 존재 여부 확인
2. 누락된 선택 파라미터에 기본값 적용
3. 타입 검증
4. SQL 바인딩

#### 시스템 변수
- `:auth.sub`: JWT claims의 사용자 ID
- `:auth.roles`: 사용자 roles 배열
- 인증된 로직에서 사용 가능

---

### 참고 코드
- Handler: `packages/services/bridge/src/handlers/call.rs`
- Parser: `packages/services/bridge/src/handlers/call.rs`
- Auth: `packages/services/bridge/src/handlers/call.rs`
- Params: `packages/services/bridge/src/handlers/call.rs`

---

## 공통 완료 기준 템플릿

각 Flow는 아래 기준을 최소 포함하도록 유지한다.
- 요청 예시: path/params/credential 중 핵심 입력값 1개 이상 제시
- 성공 기준: 기대 상태코드와 핵심 응답 필드 제시
- 실패 기준: 최소 1개 부정 케이스와 기대 에러코드 제시
