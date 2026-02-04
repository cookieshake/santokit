# Santokit Rebuild Plan (Working Notes)

이 디렉토리는 "Santokit을 새롭게 재창조"하기 위한 **실행 가능한 계획 문서**를 모아둔다.

원칙:
- `plan/`이 단일 진실 원천(Source of Truth)이다. 구현 난이도/일정에 맞춰 **MVP → 확장** 순서로 간다.
- 계획 문서는 "무엇을/왜/어떻게/완료 기준"이 있어야 한다. (체크리스트 형태 권장)
- 큰 결정(인증/권한/데이터 스토어/런타임)은 `plan/`에서 먼저 합의하고, 여기 문서를 갱신한다.

## Structure
- `plan/overview/`: 큰 그림(현황/로드맵)
- `plan/spec/`: 현재 합의된 스펙(대화 기준점)
- `plan/deploy/`: 배포 모델/아티팩트/타겟별 전략
- `plan/secrets/`: Hub-less 환경에서의 시크릿 모델
- `plan/notes/`: 비교 검토/의사결정 메모

## Entry Points
- `plan/spec/v1.md`
- `plan/spec/schema-yaml.md`
- `plan/spec/multi-project.md`
- `plan/spec/auth.md`
- `plan/deploy/cli-centric-deploy.md`
- `plan/secrets/without-hub.md`
