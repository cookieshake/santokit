# Plan 문서 개선 체크리스트

이 문서는 `plan/` 기획 문서의 충돌/모호점/운영 리스크를 줄이기 위한 우선순위 기반 체크리스트다.

## P0 (먼저 처리)

- [x] `public` 의미 단일화
  - 대상: `plan/spec/crud.md`, `plan/spec/logics.md`, `plan/spec/auth.md`, `plan/flows/logics.md`
  - 결정 필요: `public = 완전 익명 허용` vs `public = 추가 role 체크 없음(credential은 필요)`
  - 산출물: 모든 문서에서 동일 문구/동일 예시

- [x] 쿠키 네이밍 규칙 단일화
  - 대상: `plan/spec/auth.md`, `plan/flows/auth.md`
  - 현재 충돌: `stk_access`/`stk_refresh` 단일 이름과 `stk_access_<project>_<env>` 규칙이 혼재
  - 권장: v1 기본을 namespaced 쿠키로 고정하고 비네임스페이스는 제거 또는 deprecated로 명시

- [x] Final 문서에서 미결정 항목 분리
  - 대상: `plan/spec/final.md`
  - 작업: `Open Questions` 섹션을 별도 문서로 이동 (예: `plan/notes/` 또는 `plan/spec/rfcs.md`)
  - 기준: `final.md`는 확정된 결정사항만 포함

- [x] 파괴적 변경 플래그 표준화
  - 대상: `plan/spec/cli.md`, `plan/spec/schema.md`, `plan/spec/final.md`
  - 현재 충돌: `--force`와 `--allow-destroy` 혼용
  - 결정: canonical 플래그 1개 + 필요 시 alias를 명확히 문서화

- [x] rollback 용어 분리
  - 대상: `plan/spec/schema.md`, `plan/flows/operator.md`, `plan/spec/final.md`
  - 명확화: `release rollback(포인터 이동)`은 지원, `schema rollback(down migration)`은 미지원
  - 산출물: 공통 용어 정의 섹션 추가

## P1 (가독성/일관성)

- [x] `schema.md` 코드블록 깨짐 수정
  - 대상: `plan/spec/schema.md`
  - 이슈: `array` 예시 코드펜스가 닫히지 않아 이후 `file` 섹션 렌더링이 깨짐

- [x] `plan/README.md` 인덱스 정리
  - 대상: `plan/README.md`
  - 작업: 실제 존재하지 않는 경로(`plan/notes/`) 처리, 누락된 엔트리(`plan/spec/storage.md`) 추가

- [x] 구현 스택 문서 경로 최신화
  - 대상: `plan/implement/stack.md`
  - 이슈: `packages/libs/core-rs`, `packages/libs/sql-rs` 등 현재 레포 구조와 불일치
  - 작업: `packages/libs/core`, `packages/libs/sql`로 정정

- [x] 문서 언어/톤 통일
  - 대상: `plan/flows/crud.md` (영문 혼용 구간)
  - 작업: 한국어 기준 또는 팀 표준 언어로 통일

- [x] 번호 체계 정리
  - 대상: `plan/spec/final.md`
  - 작업: 대목차/소목차 번호 규칙 일관화

## P2 (운영 안정성 강화)

- [x] Credential precedence 표 추가
  - 대상: `plan/spec/final.md`, `plan/spec/auth.md`
  - 포함: API key/Bearer/Cookie 동시 입력 시 우선순위, 401/403 기준, 불일치 처리

- [x] Storage 보안 규칙 명시 강화
  - 대상: `plan/spec/storage.md`
  - 포함 권장: presigned URL TTL, key normalization(`..`/중복 slash), content-length 강제 여부, 재사용 정책

- [x] Flow별 완료 기준 템플릿 추가
  - 대상: `plan/flows/*.md`
  - 작업: 각 Flow 끝에 테스트 가능한 acceptance criteria(상태코드/응답 형태/부정 케이스) 고정 템플릿 추가

## 진행 순서 제안

1. P0를 먼저 합의/수정한다.
2. P1로 문서 렌더링/인덱스/경로 일치성을 맞춘다.
3. P2로 운영 리스크를 줄이는 명문화 작업을 한다.
