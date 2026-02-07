# AGENTS.md

이 문서는 AI 에이전트가 Santokit 프로젝트에서 작업할 때 참고해야 하는 가이드라인을 제공합니다.

## 프로젝트 개요

Santokit은 **선언적 Backend-as-a-Service 플랫폼**으로, YAML 기반의 스키마/권한 선언만으로 API를 자동 생성하고 관리하는 시스템입니다.

### 핵심 컴포넌트

| 컴포넌트 | 역할 | 위치 |
|---------|------|------|
| **Hub** | Control Plane - org/team/project/env 관리, DB connections, 스키마, 권한, 릴리즈 관리 | `packages/services/hub/` |
| **Bridge** | Data Plane - `/call` API 제공, 런타임 요청 처리 | `packages/services/bridge/` |
| **CLI (`stk`)** | 운영자용 단일 진입점 (웹 콘솔 대체) | `packages/tools/cli/` |
| **Core** | 공유 라이브러리 (핵심 타입, 유틸) | `packages/libs/core/` |
| **SQL** | SQL 생성 및 처리 라이브러리 | `packages/libs/sql/` |


## 디렉토리 구조

```
santokit/
├── packages/
│   ├── services/       # 서비스 바이너리
│   │   ├── hub/        # Control Plane
│   │   └── bridge/     # Data Plane
│   ├── tools/          # CLI 도구
│   │   └── cli/        # stk CLI
│   └── libs/           # 공유 라이브러리
│       ├── core/       # 핵심 타입/유틸
│       └── sql/        # SQL 처리
├── plan/               # 설계 문서 (Single Source of Truth)
│   ├── spec/           # 스펙 문서
│   ├── flows/          # 사용자/운영 플로우
│   ├── overview/       # 로드맵
│   └── secrets/        # 시크릿 모델
├── tests/              # 테스트
│   └── integration_py/ # Python 통합 테스트
└── scripts/            # 유틸리티 스크립트
```

## 개발 가이드라인

### 1. 문서 우선 (Documentation First)

- **`plan/` 디렉토리가 Single Source of Truth**입니다.
- 큰 결정(인증/권한/데이터 스토어/런타임)은 `plan/`에서 먼저 합의하고 문서를 갱신해야 합니다.
- 주요 스펙 문서:
  - `plan/spec/final.md` - 최종 통합 스펙
  - `plan/spec/auth.md` - 인증/인가 스펙
  - `plan/spec/cli.md` - CLI 명령어 스펙
  - `plan/spec/crud.md` - Auto CRUD 스펙
  - `plan/spec/schema.md` - 스키마 관리 스펙
  - `plan/spec/logics.md` - Custom Logic 스펙

### 2. 코드 스타일

- **Rust 표준 스타일**: `cargo fmt` 사용
- **Clippy 린트 준수**: `cargo clippy` 경고 없도록 유지
- **에러 처리**: `thiserror`와 `anyhow` 사용
  - 라이브러리 코드: `thiserror`로 구체적인 에러 타입 정의
  - 애플리케이션 코드: `anyhow`로 에러 전파

### 3. 테스트

- **통합 테스트**: `tests/integration_py/` (Python + Testcontainers)
- 테스트 실행:
  ```sh
  # flox 환경 활성화 필요
  flox activate
  cd tests/integration_py
  uv venv --clear
  uv pip install -e .
  uv run pytest
  
  # 또는 스크립트 사용
  ./scripts/run-integration-tests.sh
  ```

### 4. Flow-Test 1:1 매칭 규칙

**`plan/flows/`와 `tests/integration_py/tests/test_flow_*.py`는 1:1로 매칭되어야 합니다.**

| Flow 문서 | 테스트 파일 |
|-----------|-------------|
| `plan/flows/01-operator-bootstrap.md` | `tests/integration_py/tests/test_flow_01_operator_bootstrap.py` |
| `plan/flows/02-operator-apikey.md` | `tests/integration_py/tests/test_flow_02_operator_apikey.py` |
| `plan/flows/03-enduser-login-hub-issuer.md` | `tests/integration_py/tests/test_flow_03_enduser_login_hub_issuer.py` |
| `plan/flows/04-enduser-login-external-oidc.md` | `tests/integration_py/tests/test_flow_04_enduser_login_external_oidc.py` |
| `plan/flows/05-enduser-call-crud.md` | `tests/integration_py/tests/test_flow_05_enduser_call_crud.py` |
| `plan/flows/06-operator-schema-change.md` | `tests/integration_py/tests/test_flow_06_operator_schema_change.py` |
| `plan/flows/07-operator-permissions-change.md` | `tests/integration_py/tests/test_flow_07_operator_permissions_change.py` |
| `plan/flows/08-release-promotion-rollback.md` | `tests/integration_py/tests/test_flow_08_release_promotion_rollback.py` |
| `plan/flows/09-enduser-multi-project-login.md` | `tests/integration_py/tests/test_flow_09_enduser_multi_project_login.py` |
| `plan/flows/10-crud-advanced.md` | `tests/integration_py/tests/test_flow_10_crud_advanced.py` |
| `plan/flows/11-crud-expand.md` | `tests/integration_py/tests/test_flow_11_crud_expand.py` |
| `plan/flows/12-crud-pagination-sorting.md` | `tests/integration_py/tests/test_flow_12_crud_pagination_sorting.py` |
| `plan/flows/13-cel-condition.md` | `tests/integration_py/tests/test_flow_13_cel_condition.py` |
| `plan/flows/14-column-prefix.md` | `tests/integration_py/tests/test_flow_14_column_prefix.py` |

**규칙:**
- Flow 문서를 추가하면 해당 테스트 파일도 반드시 추가해야 합니다.
- 파일명 패턴: `{번호}-{kebab-case-name}.md` → `test_flow_{번호}_{snake_case_name}.py`

### 5. 빌드

```sh
# 전체 빌드
cargo build

# 릴리즈 빌드
cargo build --release

# 특정 패키지 빌드
cargo build -p stk-hub
cargo build -p stk-bridge
cargo build -p stk-cli
```

## 핵심 개념

### Auto CRUD
- 경로 형식: `db/{table}/{op}`
- 지원 연산: `select`, `insert`, `update`, `delete`

### Custom Logic
- 경로 형식: `logics/{name}`
- SQL 기반 커스텀 로직 실행

### Permissions
- `config/permissions.yaml` 기반
- CEL(Common Expression Language) 조건 지원
- 테이블/컬럼 레벨 권한 제어

### Releases
- `releaseId`: 스키마 IR + 권한 + 설정의 불변 스냅샷
- 환경(env)별 "current release" 포인터 관리
- `stk apply`로 릴리즈 생성/적용

## API 인증

### Data Plane (Bridge)
- **서버/CI**: `X-Santokit-Api-Key: <api_key>`
- **End User**: 
  - `Authorization: Bearer <santokit_access_token>`
  - 또는 쿠키: `stk_access_<project>_<env>=<token>`

### 멀티 프로젝트 라우팅
- `X-Santokit-Project: <project>`
- `X-Santokit-Env: <env>`

## 환경 설정

- **flox**: 개발 환경 관리 (`.flox/` 디렉토리)
- `.envrc`: direnv 설정
- `.stk/`: CLI 로컬 컨텍스트 (gitignore됨)

## 주의사항

1. **Secret 관리**: secret 값은 Git/manifest/bundle/image에 절대 포함하지 않습니다.
2. **스키마 변경**: destructive 변경은 기본 차단, `--force`로 허용 가능합니다.
3. **DB 드리프트**: 드리프트가 있으면 릴리즈가 차단됩니다.

## 관련 리소스

- 스펙 문서: `plan/spec/`
- 통합 테스트 가이드: `tests/integration_py/README.md`
