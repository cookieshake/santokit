# AGENTS.md

이 문서는 AI 에이전트가 Santokit 프로젝트에서 작업할 때 참고해야 하는 가이드라인을 제공합니다.

## 프로젝트 개요

Santokit은 **선언적 Backend-as-a-Service 플랫폼**으로, YAML 기반의 스키마/권한 선언만으로 API를 자동 생성하고 관리하는 시스템입니다.

핵심 개념, API 스펙, 인증 모델 등은 `plan/capabilities/`와 `plan/spec/`를 참조하세요.

### 핵심 컴포넌트

| 컴포넌트 | 역할 | 위치 |
|---------|------|------|
| **Hub** | Control Plane - org/project/env/릴리즈 관리 | `packages/services/hub/` |
| **Bridge** | Data Plane - `POST /call` 런타임 | `packages/services/bridge/` |
| **CLI (`stk`)** | 운영자용 단일 진입점 | `packages/tools/cli/` |
| **Core** | 공유 라이브러리 (핵심 타입, 유틸) | `packages/libs/core/` |
| **SQL** | SQL 생성 및 처리 라이브러리 | `packages/libs/sql/` |

## 디렉토리 구조

```
santokit/
├── packages/
│   ├── services/hub/       # Control Plane
│   ├── services/bridge/    # Data Plane
│   ├── tools/cli/          # stk CLI
│   └── libs/{core,sql}/    # 공유 라이브러리
├── plan/
│   ├── capabilities/       # 행동 명세 (SoT) — 구현/테스트 추적
│   └── spec/               # 공유 정의 (스키마 포맷, 에러 카탈로그 등)
├── tests/integration_py/   # Python 통합 테스트
└── scripts/                # 유틸리티 스크립트
```

## 코드 스타일

- **Rust 표준 스타일**: `cargo fmt` 사용
- **Clippy 린트 준수**: `cargo clippy` 경고 없도록 유지
- **에러 처리**:
  - 라이브러리 코드: `thiserror`로 구체적인 에러 타입 정의
  - 애플리케이션 코드: `anyhow`로 에러 전파

## 빌드

```sh
cargo build                    # 전체
cargo build -p stk-hub         # Hub만
cargo build -p stk-bridge      # Bridge만
cargo build -p stk-cli         # CLI만
```

## 테스트

통합 테스트: `tests/integration_py/` (Python + Testcontainers)

```sh
flox activate
./scripts/run-integration-tests.sh
```

Capability 도메인별로 테스트 파일이 대응됩니다:

| 도메인 | 테스트 파일 |
|--------|------------|
| operator | `test_operator.py` |
| auth | `test_auth.py` |
| crud | `test_crud.py` |
| security | `test_security.py` |
| logics | `test_logics.py` |

- Capability 추가 시 해당 테스트 파일에 함수를 추가하고, frontmatter `test_refs`에 연결합니다.
- 공통 헬퍼는 `dsl.py`: `bootstrap_project`, `create_api_key`, `api_key_headers`, `jwt_headers`, `signup_and_login`, `get_rows`

## 환경 설정

- **flox**: 개발 환경 관리 (`.flox/`)
- `.envrc`: direnv 설정
- `.stk/`: CLI 로컬 컨텍스트 (gitignore됨)

## 주의사항

1. **Secret 관리**: secret 값은 Git/manifest/bundle/image에 절대 포함하지 않습니다.
2. **스키마 변경**: destructive 변경은 기본 차단, `--force`로 허용 가능합니다.
3. **DB 드리프트**: 드리프트가 있으면 릴리즈가 차단됩니다.
