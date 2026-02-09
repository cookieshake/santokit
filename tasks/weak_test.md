# Integration Test vs Plan Spec 분석

> 분석일: 2026-02-07

## 현재 테스트 커버리지

| 테스트 파일 | 테스트 내용 | 관련 스펙 |
|------------|------------|----------|
| `01_operator_bootstrap` | 프로젝트/환경 생성, DB 연결, apply | `final.md`, `cli.md` |
| `02_operator_apikey` | API Key 생성/조회/폐기 | `auth.md` |
| `03_enduser_login_hub_issuer` | End User 회원가입/로그인 (Hub Issuer) | `auth.md` |
| `04_enduser_login_external_oidc` | External OIDC 연동 | `auth.md` |
| `05_enduser_call_crud` | Insert + Select (API Key 인증) | `crud.md` |
| `06_operator_schema_change` | 스키마 변경 (컬럼 추가) | `schema.md` |
| `07_operator_permissions_change` | 권한 변경 | `crud.md` |
| `08_release_promotion_rollback` | 릴리즈 promote/rollback | `cli.md`, `final.md` |
| `09_enduser_multi_project_login` | 멀티 프로젝트 로그인 | `auth.md` |

---

## ✅ 잘 반영된 영역

| 스펙 영역 | 커버리지 | 설명 |
|----------|---------|------|
| **Operator Auth** | ✅ 높음 | 로그인, 프로젝트/환경 관리 |
| **End User Auth** | ✅ 높음 | Hub Issuer 로그인, OIDC 시작 |
| **API Key 관리** | ✅ 높음 | 생성, 조회, 폐기 |
| **Custom Logics** | ✅ 높음 | 호출, 파라미터 바인딩, 권한, 에러 처리 (7개 테스트) |
| **Schema 관리** | ✅ 높음 | 기본 변경, FK 관계 완료; 파괴적 변경/드리프트 미테스트 |
| **Permissions** | ⚠️ 중간 | 기본 role 변경만, CEL condition 미테스트 |
| **Release** | ✅ 높음 | promote, rollback |
| **기본 CRUD** | ⚠️ 중간 | insert, select만, update/delete 미테스트 |

---

## ❌ 누락된 테스트 영역

### 1. CRUD 고급 기능 (`crud.md`)

| 항목 | 스펙 | 테스트 |
|-----|------|-------|
| `update` 작업 | ✅ 정의됨 | ✅ 테스트 완료 (`10-crud-advanced`) |
| `delete` 작업 | ✅ 정의됨 | ✅ 테스트 완료 (`10-crud-advanced`) |
| `where` 빈 상태 거부 | ✅ 필수 안전장치 | ✅ 테스트 완료 (`10-crud-advanced`) |
| `expand` (FK 관계 로드) | ✅ 정의됨 | ✅ 테스트 완료 (`11-crud-expand`) |
| `orderBy`, `limit`, `offset` | ✅ 정의됨 | ✅ 테스트 완료 (`12-crud-pagination-sorting`) |
| CEL `condition` WHERE 주입 | ✅ 정의됨 | ✅ 테스트 완료 (`test_flow_13_cel_condition.py`) |
| Column Prefix Rules | ✅ 정의됨 | ✅ 테스트 완료 (`test_flow_14_column_prefix.py`) |
| `columns.select/update` 제한 | ✅ 정의됨 | ✅ 테스트 완료 (`test_flow_16_column_permissions.py`) |

### 2. Storage (`storage.md`)

| 항목 | 스펙 | 테스트 |
|-----|------|-------|
| `upload_sign` | ✅ 정의됨 | ❌ 미테스트 |
| `download_sign` | ✅ 정의됨 | ❌ 미테스트 |
| `delete` | ✅ 정의됨 | ❌ 미테스트 |
| `file` 타입 onDelete cascade | ✅ 정의됨 | ❌ 미테스트 |

### 3. Custom Logics (`logics.md`)

| 항목 | 스펙 | 테스트 | 테스트 파일 |
|-----|------|-------|-----------|
| `logics/{name}` 호출 | ✅ 정의됨 | ✅ 테스트 완료 | `test_logics.py::test_logics_whoami` |
| Parameter binding (required) | ✅ 정의됨 | ✅ 테스트 완료 | `test_logics.py::test_logics_get_items` |
| Parameter binding (default values) | ✅ 정의됨 | ✅ 테스트 완료 | `test_logics.py::test_logics_default_params` |
| `:auth.sub` 시스템 변수 | ✅ 정의됨 | ✅ 테스트 완료 | `test_logics.py::test_logics_whoami` |
| `auth: public` 설정 | ✅ 정의됨 | ✅ 테스트 완료 | `test_logics.py::test_logics_public_hello` |
| `roles` 권한 검증 | ✅ 정의됨 | ✅ 테스트 완료 | `test_logics.py::test_logics_admin_only` |
| INSERT/UPDATE SQL 실행 | ✅ 정의됨 | ✅ 테스트 완료 | `test_logics.py::test_logics_insert_item` |
| SELECT 쿼리 실행 | ✅ 정의됨 | ✅ 테스트 완료 | `test_logics.py::test_logics_get_items` |
| 에러 처리 (missing param) | ✅ 정의됨 | ✅ 테스트 완료 | `test_logics.py::test_logics_error_cases` |
| 에러 처리 (not found) | ✅ 정의됨 | ✅ 테스트 완료 | `test_logics.py::test_logics_error_cases` |
| 에러 처리 (unauthorized) | ✅ 정의됨 | ✅ 테스트 완료 | `test_logics.py::test_logics_error_cases` |
| 에러 처리 (invalid type) | ✅ 정의됨 | ✅ 테스트 완료 | `test_logics.py::test_logics_error_cases` |

**테스트 커버리지**: 7개 테스트 케이스, 12개 기능 검증 완료
- ✅ B1: `whoami` - `:auth.sub` 시스템 변수 바인딩
- ✅ B2: `public_hello` - public 로직 호출
- ✅ B3: `insert_item` - INSERT 쿼리 실행 및 파라미터 바인딩
- ✅ B4: `get_items` - SELECT 쿼리 및 필수 파라미터 검증
- ✅ B5: `default_params` - 기본값 처리 (없음/부분/전체 오버라이드)
- ✅ B6: `admin_only` - role 기반 권한 검증 (403 vs 200)
- ✅ B7: `error_cases` - 4가지 에러 시나리오 (400/401/404)

### 4. Schema 고급 기능 (`schema.md`)

| 항목 | 스펙 | 테스트 | 테스트 파일 |
|-----|------|-------|-----------|
| 기본 스키마 적용 (컬럼 추가) | ✅ 정의됨 | ✅ 테스트 완료 | `test_operator.py::test_operator_schema_change` |
| FK `references` 정의 | ✅ 정의됨 | ✅ 테스트 완료 | `test_crud.py::test_crud_expand` (간접) |
| `onDelete: cascade` 동작 | ✅ 정의됨 | ✅ 테스트 완료 | `expand/schema/posts.yaml` 사용 |
| 파괴적 변경 (컬럼 삭제) + `--force` | ✅ 정의됨 | ❌ 미테스트 | - |
| Drift Detection (릴리즈 차단) | ✅ 정의됨 | ❌ 미테스트 | - |
| Multi-connection (여러 DB) | ✅ 정의됨 | ❌ 미테스트 | - |

**테스트 커버리지**: 기본 기능 완료, 고급 기능 부분 완료
- ✅ **기본 스키마 변경**: `schema-1` → `schema-2` 마이그레이션 테스트
- ✅ **FK 관계**: `posts.user_id` → `users.id` 참조 정의 및 expand 동작 검증
- ❌ **파괴적 변경**: `--force` 플래그를 통한 컬럼/테이블 삭제 미검증
- ❌ **드리프트 감지**: 수동 DB 변경 시 릴리즈 차단 정책 미검증
- ❌ **멀티 DB**: 여러 connection 동시 사용 시나리오 미검증

### 5. Auth 고급 기능 (`auth.md`)

| 항목 | 스펙 | 테스트 |
|-----|------|-------|
| Refresh Token | ✅ 정의됨 | ❌ 미테스트 |
| Token 만료 처리 | ✅ 정의됨 | ❌ 미테스트 |
| OIDC callback 완료 (실제 토큰 교환) | ✅ 정의됨 | ⚠️ start만 테스트 |

---

## 📈 커버리지 요약

```
전체 스펙 기능 수: ~40개
테스트된 기능 수: ~30개 (Custom Logics 12개 + Schema FK 3개 추가)
커버리지: 약 75%
```

---

## 🎯 우선순위별 추가 필요 테스트

### 🔴 높음 (핵심 기능)

1. **`test_storage_presign.py`** ⚠️ 미구현
   - Storage upload_sign/download_sign
   - 정책 기반 권한 체크
   - file 타입 onDelete cascade

2. ~~**`test_logics_call.py`**~~ ✅ **완료** (`test_logics.py`)
   - ✅ Custom Logic 호출 (7개 테스트 케이스)
   - ✅ Parameter binding (required/default)
   - ✅ `:auth.sub` 시스템 변수
   - ✅ Role 기반 권한 검증
   - ✅ 에러 처리 (400/401/404)

### 🟡 중간 (보안/안정성)

5. **`test_column_permissions.py`**
   - Column Prefix Rules (c_, p_, s_, _)
   - permissions.yaml columns 제한

6. **`test_cel_condition.py`**
   - CEL condition → WHERE 주입
   - `resource.id == request.auth.sub` 패턴

7. **`test_schema_destructive.py`**
   - 파괴적 변경 (컬럼 삭제/타입 변경)
   - --force 플래그 필요

### 🟢 낮음 (고급 기능)

8. **`test_multi_connection.py`**
   - 다중 DB 연결
   - 연결별 테이블 분리

9. **`test_refresh_token.py`**
   - 토큰 갱신
   - 만료 처리

10. **`test_drift_detection.py`**
    - 스키마 드리프트 감지
    - 수동 DB 변경 감지
