# Auth Capability Guide

이 도메인은 end-user 인증 흐름을 다룬다. Hub가 identity를 발급·검증하는 제어-평면 역할을 맡고,
Bridge는 Hub가 발급한 토큰을 오프라인으로 검증하여 data-plane 요청을 인가한다.
raw OIDC 토큰은 Bridge에 직접 제시할 수 없으며, 항상 Hub를 통해 Santokit access token으로 교환해야 한다.

## 흐름 및 의존 관계

모든 auth capability는 OPERATOR-001(bootstrap)과 OPERATOR-004(permissions apply)를 전제한다.
릴리즈가 없는 env에서는 토큰 발급 자체가 의미가 없기 때문이다.

### 1단계 — Hub 자체 발급 로그인: `AUTH-001`

Hub가 직접 end-user identity를 생성하고 `project/env`에 바인딩된 access token을 발급한다.
Bridge는 토큰의 context binding을 검증한 뒤 릴리즈 정책에 따라 요청을 인가한다.
이 capability가 auth 도메인의 기본 계약이며 이후 모든 capability가 이 토큰 모델 위에 구축된다.

- [`AUTH-001`](AUTH-001-hub-issuer-login.md) — Hub 발급 signup/login → Bridge 인가

### 2단계 — 외부 OIDC 연동: `AUTH-002`

Operator가 Hub에 외부 identity provider 메타데이터를 등록한다.
이 설정이 완료되어야 end-user가 third-party provider로 로그인을 시작할 수 있다.
등록 단계는 순수 Hub(제어-평면) 작업이며 Bridge에는 영향을 주지 않는다.

- [`AUTH-002`](AUTH-002-oidc-provider-config.md) — OIDC provider 등록

### 3단계 — 멀티 프로젝트 격리: `AUTH-003`

AUTH-001이 확립한 토큰 바인딩 모델을 여러 project/env에 동시에 적용할 때의 격리 규칙을 검증한다.
Hub는 context별 독립 세션을 유지하고 Bridge는 context 불일치 요청을 거부한다.
멀티 프로젝트 사용자가 늘어날수록 이 capability의 경계가 중요해진다.

- [`AUTH-003`](AUTH-003-multi-project-login.md) — project/env 컨텍스트 격리

### 4단계 — 명시적 identity 연결: `AUTH-004`

AUTH-002로 등록된 provider에 대해, 이미 세션이 있는 end-user가 자신의 계정에 OIDC identity를
명시적으로 연결한다. 이메일 기반 자동 병합은 허용하지 않으므로 소유권 충돌 시 409로 거부된다.

- [`AUTH-004`](AUTH-004-oidc-link.md) — 명시적 OIDC 계정 연결 (planned)

## 컴포넌트 경계 요약

| Capability | Hub(control-plane) | Bridge(data-plane) |
|---|---|---|
| AUTH-001 | identity 생성·토큰 발급 | 토큰 context 검증·인가 |
| AUTH-002 | provider 메타데이터 저장 | — |
| AUTH-003 | context별 세션 격리 | context binding 강제 |
| AUTH-004 | OIDC link 흐름 처리 | — |
