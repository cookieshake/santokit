# Santokit Rebuild Plan (Working Notes)

이 디렉토리는 "Santokit을 새롭게 재창조"하기 위한 **실행 가능한 계획 문서**를 모아둔다.

원칙:
- `plan/`이 단일 진실 원천(Source of Truth)이다.
- 계획 문서는 "무엇을/왜/어떻게/완료 기준"이 있어야 한다. (체크리스트 형태 권장)
- 큰 결정(인증/권한/데이터 스토어/런타임)은 `plan/`에서 먼저 합의하고, 여기 문서를 갱신한다.

## Spec 문서 템플릿 (권장)

`plan/spec/*.md`는 아래 섹션을 기본 골격으로 사용한다. (문서 성격에 따라 일부 생략 가능)

필수(권장) 섹션:
- 목표: 이 스펙이 해결하는 문제와 비목표(Non-goals)
- 범위: MVP에 포함/제외되는 항목을 명시
- 용어: 스펙 내에서 반복되는 용어/약어 정의
- 계약(Contract): 엔드포인트/CLI/파일 포맷 등 외부에 노출되는 인터페이스
  - Request/Response 예시(JSON/YAML)
  - 실패 케이스 + 에러 코드/HTTP status
- 동작 규칙: 평가 순서, 우선순위, 제한 사항, 호환성 규칙
- 보안: 인증/인가, 민감정보 마스킹, 권한 경계
- 운영: 관측(로그/메트릭/트레이스), 장애 모드, 롤백/복구, 보존 정책(해당 시)
- 테스트/검증: 어떤 시나리오로 검증할지(통합 테스트 매핑 포함)
- 미결정: `plan/notes/open-questions.md`로 남길 항목 링크

문서 작성 규칙:
- "결정"과 "미결정"을 섞지 않는다. 미결정은 `plan/notes/open-questions.md`에만 남긴다.
- 예시는 최소 1개 이상 포함한다(가능하면 성공/실패 각각 1개).
- 구현 세부(내부 타입/모듈 구조)는 `plan/implement/`로 분리한다.

## Structure
- `plan/overview/`: 큰 그림(현황/로드맵)
- `plan/spec/`: 현재 합의된 스펙(대화 기준점)
- `plan/implement/`: 구현 기술 스택/아키텍처
- `plan/secrets/`: Hub 기반 시크릿/연결정보 모델
- `plan/flows/`: 사용자/운영 플로우(시나리오별 문서)
- `plan/notes/`: 비교 검토/의사결정 메모

## Entry Points
- `plan/spec/final.md`
- `plan/spec/glossary.md`
- `plan/spec/errors.md`
- `plan/spec/audit-log.md`
- `plan/spec/auth.md`
- `plan/spec/cli.md`
- `plan/spec/crud.md`
- `plan/spec/schema.md`
- `plan/spec/storage.md`
- `plan/implement/stack.md`
- `plan/secrets/model.md`
- `plan/flows/`
- `plan/notes/open-questions.md`
