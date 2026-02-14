# Operator Capability Guide

이 도메인은 시스템을 운영 가능한 상태로 만들고 유지하는 제어-평면(control-plane) 흐름 전체를 다룬다.
모든 capability는 CLI(`stk`) → Hub(제어-평면) 경로로 동작하며, 데이터-평면(Bridge)은 Hub가 확립한
릴리즈 상태를 소비한다.

## 흐름 및 의존 관계

**OPERATOR-001 → OPERATOR-002/003/004 → OPERATOR-005** 순서가 필수 선행 관계다.
Hub에 프로젝트·env·연결이 확보되지 않으면 이후 어떤 capability도 의미가 없다.

### 1단계 — 기반 확립: `OPERATOR-001`

CLI로 project/env 스코프를 생성하고 DB 연결을 등록·검증한 뒤 첫 `stk apply`를 실행한다.
이 단계에서 Hub가 최초 릴리즈 포인터를 발급하고, Bridge가 data-plane 요청을 처리할 수 있는
전제 조건이 완성된다.

- [`OPERATOR-001`](OPERATOR-001-bootstrap.md) — Bootstrap: project/env/connection/apply

### 2단계 — 자격증명 및 스키마/정책 반영

부트스트랩 이후 세 capability는 독립적으로 병행 가능하지만 모두 OPERATOR-001에 의존한다.

- [`OPERATOR-002`](OPERATOR-002-apikey.md) — API Key 생성·조회·폐기. Hub가 키 레코드를 관리하고
  Bridge는 `X-Santokit-Api-Key` 헤더로 검증한다. 비인간 호출자(서버, CI)의 data-plane 접근 경로다.
- [`OPERATOR-003`](OPERATOR-003-apply-schema.md) — 선언형 ref 기반 스키마 변경 계획·적용.
  Hub가 호환성을 검증하고, 성공 시에만 릴리즈 상태를 전진시킨다. dry-run 지원.
- [`OPERATOR-004`](OPERATOR-004-apply-permissions.md) — permissions.yaml 기반 권한 정책 반영.
  Bridge가 런타임에 사용하는 릴리즈 스냅샷에 정책이 포함된다.

### 3단계 — 릴리즈 생명주기: `OPERATOR-005`

OPERATOR-003·004가 확립한 릴리즈를 환경 간에 이동시키거나 이전 시점으로 복구한다.
Hub가 포인터를 업데이트하면 Bridge는 즉시 새 릴리즈 스냅샷을 참조한다.
프로모션은 스키마 마이그레이션을 직접 수행하지 않으므로 DB 호환성은 사전에 보장되어야 한다.

- [`OPERATOR-005`](OPERATOR-005-release-promote-rollback.md) — env 간 release promote/rollback

### 부가 capability — 팀 운영 및 헬스

- [`OPERATOR-006`](OPERATOR-006-rbac.md) — Operator RBAC. Hub 제어-평면 접근 권한을 org/project
  스코프로 위임·회수한다. OPERATOR-001 이후 언제든 적용 가능하다. (planned)
- [`OPERATOR-007`](OPERATOR-007-health.md) — Hub/Bridge 상태 확인. 배포 파이프라인이나 모니터링이
  시스템 가용성을 검증할 때 사용한다.

## 컴포넌트 경계 요약

| Capability | CLI(stk) | Hub(control-plane) | Bridge(data-plane) |
|---|---|---|---|
| OPERATOR-001 | 명령 진입 | 스코프·연결·릴리즈 관리 | — |
| OPERATOR-002 | 키 관리 명령 | 키 레코드 저장 | 키 검증 |
| OPERATOR-003/004 | apply 명령 | 스키마·정책 검증·릴리즈 | 릴리즈 소비 |
| OPERATOR-005 | release 명령 | 포인터 이동 | 새 릴리즈 참조 |
| OPERATOR-006 | 초대·역할 명령 | 멤버십 정책 | — |
| OPERATOR-007 | — | 헬스 엔드포인트 | 헬스 엔드포인트 |
