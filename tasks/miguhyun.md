# 📊 Santokit 구현 상황 분석 보고서

> 작성일: 2026-02-07

## 📋 Plan 문서 요약

`plan/` 디렉토리에는 Santokit의 전체 스펙이 정의되어 있습니다:

| 문서 | 내용 |
|------|------|
| `spec/final.md` | 전체 아키텍처, 컴포넌트 역할, Runtime API |
| `spec/auth.md` | Operator/End User 인증, API Key, PASETO 토큰 |
| `spec/crud.md` | Auto CRUD, 권한 모델, CEL Condition |
| `spec/schema.md` | 선언 스키마(YAML), Plan/Apply, Drift Policy |
| `spec/logics.md` | Custom Logic (SQL Functions) |
| `spec/storage.md` | File Storage, S3 Presigned URL |
| `spec/cli.md` | CLI Context, Unified Apply |
| `implement/stack.md` | 기술 스택, 4 Phase 작업 계획 |

---

## 📦 Packages 구현 현황

### 1. **`packages/libs/core`** (stk-core) ✅
| 모듈 | 상태 | 설명 |
|------|------|------|
| `schema/` | ✅ 구현됨 | YAML 파서, Schema IR, 타입 정의 |
| `permissions/` | ✅ 구현됨 | 권한 정책 파싱, CEL 평가기(Evaluator) |
| `auth/` | ✅ 구현됨 | API Key 구조, PASETO Claims, Token 검증 |
| `storage.rs` | ✅ 구현됨 | StorageConfig, BucketConfig, Policy Rule |
| `error.rs` | ✅ 구현됨 | 공통 에러 타입 |
| `id.rs` | ✅ 구현됨 | ULID/UUID 생성 |

### 2. **`packages/libs/sql`** (stk-sql) ✅
| 모듈 | 상태 | 설명 |
|------|------|------|
| `builder.rs` | ✅ 구현됨 | Select/Insert/Update/Delete Builder |
| `ddl.rs` | ✅ 구현됨 | DDL Generator (CREATE TABLE) |
| `params.rs` | ✅ 구현됨 | CRUD 파라미터 파싱/검증 |

### 3. **`packages/services/hub`** (Control Plane) ✅
| 기능 | 상태 | 설명 |
|------|------|------|
| Operator 인증 | ✅ 구현됨 | Login/Logout/Me, Argon2 비밀번호 |
| Project/Env 관리 | ✅ 구현됨 | 생성/조회, Audit Log |
| Connection 설정 | ✅ 구현됨 | Set/Test/List |
| API Key 관리 | ✅ 구현됨 | Create/List/Revoke |
| Release 관리 | ✅ 구현됨 | Apply/Current/List/Promote/Rollback |
| Schema Snapshot/Drift | ✅ 구현됨 | snapshot/drift 엔드포인트 |
| OIDC 연동 | ✅ 구현됨 | Provider Set/List/Delete, Start/Callback |
| End User 계정 | ✅ 구현됨 | Signup/Login/Token/Logout |
| Audit Log | ✅ 구현됨 | 조회 API |
| Operator 관리 | ✅ 구현됨 | 초대/역할/상태 변경 |

### 4. **`packages/services/bridge`** (Data Plane) ✅
| 기능 | 상태 | 설명 |
|------|------|------|
| `/call` 엔드포인트 | ✅ 구현됨 | 핵심 API 라우팅 |
| Auto CRUD | ✅ 구현됨 | Select/Insert/Update/Delete |
| Custom Logic | ✅ 구현됨 | SQL 파일 실행, 파라미터 바인딩 |
| Storage | ✅ 구현됨 | upload_sign/download_sign/delete |
| 인증 처리 | ✅ 구현됨 | API Key, PASETO 검증 |
| 권한 체크 | ✅ 구현됨 | CEL 기반 Condition 평가 |
| Request Context | ✅ 구현됨 | Project/Env 헤더 파싱 |

### 5. **`packages/tools/cli`** (stk) ✅
| 커맨드 | 상태 | 설명 |
|------|------|------|
| `login/logout/whoami` | ✅ 구현됨 | Operator 인증 |
| `project create/list` | ✅ 구현됨 | 프로젝트 관리 |
| `env create/list` | ✅ 구현됨 | 환경 관리 |
| `connections set/test/list` | ✅ 구현됨 | DB 연결 설정 |
| `apikey create/list/revoke` | ✅ 구현됨 | API Key 관리 |
| `context set/show` | ✅ 구현됨 | Repo Context |
| `apply` | ✅ 구현됨 | Unified Apply |
| `release current/list/show/promote/rollback` | ✅ 구현됨 | 릴리즈 관리 |
| `schema snapshot/drift` | ✅ 구현됨 | 스키마 관리 |
| `oidc provider set/list/delete` | ✅ 구현됨 | OIDC 설정 |
| `operators list/invite/update-roles/update-status` | ✅ 구현됨 | Operator 관리 |
| `audit logs` | ✅ 구현됨 | Audit 조회 |

---

## 🔴 미구현 또는 추가 구현 필요 사항

### 1. **SDKs** (미구현) ❌
`plan/spec/final.md`에서 언급된 SDK들이 아직 없습니다:
- `packages/sdks/typescript/` - TypeScript Client SDK
- `packages/sdks/python/` - Python Client SDK  
- `packages/sdks/swift/` - Swift iOS SDK

### 2. **Contracts** (미구현) ❌
- `packages/contracts/` - SDK/서버 공유 계약 아티팩트

### 3. **Bridge 기능 부족 사항**
| 기능 | 상태 | 설명 |
|------|------|------|
| `expand` (FK 기반 관계 로드) | ❓ 확인 필요 | `crud.md`에 명시된 기능 |
| Edge Cache | ❓ 확인 필요 | Cloudflare Cache API 연동 (대화 이력에서 언급) |
| `file` 타입 onDelete cascade | ❓ 확인 필요 | Storage 연동 시 파일 자동 삭제 |

### 4. **Storage 실제 S3 연동** ⚠️
- `storage.rs`에 타입/설정 구조는 있지만, **실제 AWS S3 SDK 연동**(Presigned URL 생성 등)이 Bridge에서 완전히 구현되었는지 확인 필요

### 5. **CEL Condition → SQL WHERE 변환** ⚠️
- `plan/spec/crud.md`에서 "CEL 표현식을 WHERE절에 주입하여 DB 레벨에서 필터링(RLS)"이 명시됨
- `permissions/evaluator.rs`가 있지만, RLS 수준의 WHERE절 주입이 완전한지 확인 필요

### 6. **Multi-Connection 지원** ⚠️
- 스키마에서 table별 connection 지정이 가능해야 함
- 현재 구현에서 다중 DB connection pool 관리가 제대로 되는지 확인 필요

### 7. **Column Prefix Rules 자동 적용** ⚠️
- `crud.md`에서 `s_`, `c_`, `p_`, `_` prefix 규칙이 명시됨
- Bridge의 Auto CRUD에서 이 규칙이 자동 적용되는지 확인 필요

### 8. **Dev Mode (STK_DISABLE_AUTH)** ⚠️
- `auth.md`에서 Dev Mode 언급됨
- Bridge에서 `STK_DISABLE_AUTH=true` 시 auth/permission 우회가 구현되어 있는지 확인 필요

---

## 📈 구현 Phase 대비 진행 상황

**`implement/stack.md`의 4 Phase 기준:**

| Phase | 내용 | 상태 |
|-------|------|------|
| **Phase 1: Core & Schema** | workspace 설정, core-rs, sql-rs | ✅ 완료 |
| **Phase 2: CLI & Migration** | stk apply, Schema Apply | ✅ 완료 |
| **Phase 3: Bridge (Runtime)** | /call, Auto CRUD, CEL 권한 | ✅ 대부분 완료 |
| **Phase 4: Storage & Logic** | Custom SQL, S3 Presigned | ⚠️ 부분 완료 |

---

## 📝 권장 다음 작업

### 우선순위 높음 (핵심 기능)
1. **SDKs 구현** - TypeScript SDK 우선 (가장 범용적)
2. **Storage S3 연동 완성** - 실제 Presigned URL 생성 검증
3. **expand 기능 구현** - FK 기반 관계 로드

### 우선순위 중간 (품질 개선)
4. **Column Prefix Rules 검증** - Auto CRUD에서 자동 적용 확인
5. **CEL → SQL WHERE 변환 검증** - RLS 수준 지원 확인
6. **Dev Mode 구현 확인** - 개발 편의성

### 우선순위 낮음 (추가 기능)
7. **Python/Swift SDK** - 필요 시
8. **Multi-engine 지원** - Postgres 외 DB
