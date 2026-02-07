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
| **Schema 관리** | ⚠️ 중간 | 컬럼 추가만, 삭제/수정 미테스트 |
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
| `columns.select/update` 제한 | ✅ 정의됨 | ❌ 미테스트 |

### 2. Storage (`storage.md`)

| 항목 | 스펙 | 테스트 |
|-----|------|-------|
| `upload_sign` | ✅ 정의됨 | ❌ 미테스트 |
| `download_sign` | ✅ 정의됨 | ❌ 미테스트 |
| `delete` | ✅ 정의됨 | ❌ 미테스트 |
| `file` 타입 onDelete cascade | ✅ 정의됨 | ❌ 미테스트 |

### 3. Custom Logics (`logics.md`)

| 항목 | 스펙 | 테스트 |
|-----|------|-------|
| `logics/{name}` 호출 | ✅ 정의됨 | ❌ 미테스트 |
| Parameter binding | ✅ 정의됨 | ❌ 미테스트 |
| `:auth.sub` 시스템 변수 | ✅ 정의됨 | ❌ 미테스트 |

### 4. Schema 고급 기능 (`schema.md`)

| 항목 | 스펙 | 테스트 |
|-----|------|-------|
| 파괴적 변경 (컬럼 삭제) + `--force` | ✅ 정의됨 | ❌ 미테스트 |
| Drift Detection | ✅ 정의됨 | ❌ 미테스트 |
| Multi-connection (여러 DB) | ✅ 정의됨 | ❌ 미테스트 |
| FK `references` 정의 | ✅ 정의됨 | ❌ 미테스트 |

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
테스트된 기능 수: ~15개
커버리지: 약 37.5%
```

---

## 🎯 우선순위별 추가 필요 테스트

### 🔴 높음 (핵심 기능)

1. **`test_crud_update_delete.py`**
   - update/delete 작업
   - where 필수 검증 (빈 where 거부)

2. **`test_crud_expand.py`**
   - FK 관계 로드
   - 권한 체크 (expand 대상 테이블)

3. **`test_logics_call.py`**
   - Custom Logic 호출
   - Parameter binding
   - `:auth.sub` 시스템 변수

4. **`test_storage_presign.py`**
   - Storage upload_sign/download_sign
   - 정책 기반 권한 체크

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
