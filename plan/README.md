# Santokit Rebuild Plan (Working Notes)

이 디렉토리는 "Santokit을 새롭게 재창조"하기 위한 **실행 가능한 계획 문서**를 모아둔다.

원칙:
- `plan/capabilities/`가 구현/테스트 추적의 단일 진실 원천(Source of Truth)이다.
- Capability 문서는 "무엇을/왜/검증"을 포함해야 한다.
- 큰 결정(인증/권한/데이터 스토어/런타임)은 `plan/`에서 먼저 합의하고 문서를 갱신한다.

## Capability 우선 구조

`plan/capabilities/*.md`는 기능 단위 규범 문서다.

핵심 규칙:
- ID: `DOMAIN-NNN` (예: `AUTH-003`)
- 파일명: `{ID}-{slug}.md`
- 구현 완료 확인은 `test_refs`와 `verify`로 판단한다.

자세한 스키마는 `plan/capabilities/README.md`를 따른다.

## Spec 문서 역할

`plan/spec/*.md`는 공통 정의/규칙만 유지한다.
- 에러 포맷, 컨벤션, 공통 인증 우선순위 같은 재사용 규칙
- 개별 기능 계약은 capability 문서에서 관리

## Domain Guide 역할

`plan/capabilities/<domain>/README.md`는 서사/절차만 유지한다.
- 각 단계는 관련 capability ID를 링크한다.
- 구현/테스트의 pass/fail 기준은 capability 문서를 따른다.

## Spec 문서 템플릿 (선택)

`plan/spec/*.md`는 아래 섹션을 기본 골격으로 사용한다. (문서 성격에 따라 생략 가능)

핵심 섹션:
- 목표: 이 스펙이 해결하는 문제와 비목표(Non-goals)
- 범위: MVP에 포함/제외되는 항목을 명시
- 계약(Contract): 엔드포인트/CLI/파일 포맷 등 외부 인터페이스
  - Request/Response 예시(JSON/YAML)
  - 실패 케이스 + 에러 코드/HTTP status
- 동작 규칙: 평가 순서, 우선순위, 제한 사항, 호환성 규칙

선택 섹션 (해당 시 포함):
- 용어: 스펙 내에서 반복되는 용어/약어 정의 (또는 `glossary.md` 참조)
- 보안: 인증/인가, 민감정보 마스킹, 권한 경계
- 운영: 장애 모드, 롤백/복구 (상세는 `capabilities/<domain>/README.md` 참조 가능)
- 테스트/검증: 핵심 시나리오 (상세는 `capabilities/security/README.md` 참조 가능)

문서 작성 규칙:
- "결정"과 "미결정"을 섞지 않는다. 미결정은 `plan/notes/open-questions.md`에만 남긴다.
- 예시는 최소 1개 이상 포함한다(가능하면 성공/실패 각각 1개).

## Structure
- `plan/overview/`: 큰 그림(현황/로드맵)
- `plan/capabilities/`: 기능 단위 규범 + 구현/테스트 추적 SoT
- `plan/spec/`: 공통 규칙/정의 모듈
- `plan/secrets/`: Hub 기반 시크릿/연결정보 모델
- `plan/notes/`: 비교 검토/의사결정 메모

## Entry Points
- `plan/spec/final.md`
- `plan/capabilities/README.md`
- `plan/spec/glossary.md`
- `plan/spec/conventions.md`
- `plan/spec/errors.md`
- `plan/spec/auth.md`
- `plan/spec/cli.md`
- `plan/spec/crud.md`
- `plan/spec/schema.md`
- `plan/spec/storage.md`
- `plan/secrets/model.md`
- `plan/notes/open-questions.md`

## Validation

- Capability 문서 검증: `python3 scripts/validate-capabilities.py`
