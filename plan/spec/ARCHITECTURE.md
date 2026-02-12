# 아키텍처 개요

이 문서는 Santokit 명세를 탐색하고 시스템 아키텍처를 이해하기 위한 가이드를 제공합니다.

---

## 스펙 읽기 순서 (권장)

### Tier 1: 기초 (먼저 읽을 것)

용어와 전체 설계를 이해하기 위해 여기서 시작하세요:

1. **`glossary.md`** — 공통 용어 (Org, Project, Env, Release 등)
2. **`conventions.md`** — 네이밍 표준 및 코딩 규칙
3. **`errors.md`** — 에러 카탈로그 및 에러 처리 패턴
4. **`final.md`** — 전체 시스템 설계 및 아키텍처

### Tier 2: 핵심 컴포넌트

대부분의 기능이 의존하는 핵심 기능:

5. **`schema.md`** — 스키마 관리 (테이블, 컬럼, 마이그레이션)
6. **`auth.md`** — 인증 및 인가 (Operator, End User, API 키)
7. **`crud.md`** — 자동 CRUD 작업 (select, insert, update, delete)
8. **`logics.md`** — 커스텀 SQL 로직 및 트랜잭션

### Tier 3: 고급 기능

핵심 컴포넌트 위에 구축된 확장 기능:

9. **`storage.md`** — 파일 스토리지 (S3 presigned URL)
10. **`events.md`** — Pub/Sub & Cron (토픽, 구독, 스케줄)
11. **`operator-rbac.md`** — Operator 권한 (org/team/project 역할)
12. **`client-sdk.md`** — 클라이언트 라이브러리 (TypeScript SDK)

### Tier 4: 운영

운영 관련 사항 및 도구:

13. **`bridge-hub-protocol.md`** — 내부 통신 (Bridge ↔ Hub)
14. **`observability.md`** — 메트릭, 로그, 트레이스 (OpenTelemetry)
15. **`audit-log.md`** — 감사 로깅 (누가 언제 무엇을 했는지)
16. **`cli.md`** — CLI 인터페이스 (`stk` 명령어)
17. **`mcp.md`** — MCP 통합 (스키마 인트로스펙션)

---

## 컴포넌트 의존성 그래프

```
                    ┌─────────────────┐
                    │    Tier 1       │
                    │  Foundation     │
                    │                 │
                    │  glossary.md    │
                    │  conventions.md │
                    │  errors.md      │
                    │  final.md       │
                    └────────┬────────┘
                             │
                ┌────────────┼────────────┐
                │            │            │
         ┌──────▼──────┐ ┌──▼──────┐ ┌──▼──────┐
         │   schema    │ │  auth   │ │  crud   │
         │             │ │         │ │         │
         │  Tier 2     │ │ Tier 2  │ │ Tier 2  │
         │  Core       │ │  Core   │ │  Core   │
         └──────┬──────┘ └──┬──────┘ └──┬──────┘
                │           │            │
                │      ┌────▼────┐       │
                │      │ logics  │       │
                │      │         │       │
                │      │ Tier 2  │       │
                │      │  Core   │       │
                │      └────┬────┘       │
                │           │            │
                └───────────┼────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────▼────┐         ┌───▼────┐         ┌───▼────┐
   │ storage │         │ events │         │operator│
   │         │         │        │         │ -rbac  │
   │ Tier 3  │         │ Tier 3 │         │        │
   │Advanced │         │Advanced│         │ Tier 3 │
   └─────────┘         └────┬───┘         └────────┘
                            │
                       ┌────▼────┐
                       │ client  │
                       │  -sdk   │
                       │         │
                       │ Tier 3  │
                       └────┬────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
   ┌────▼────┐         ┌───▼────┐         ┌───▼────┐
   │ bridge  │         │observ- │         │ audit  │
   │  -hub   │         │ability │         │  -log  │
   │         │         │        │         │        │
   │ Tier 4  │         │ Tier 4 │         │ Tier 4 │
   │  Ops    │         │  Ops   │         │  Ops   │
   └─────────┘         └────────┘         └────┬───┘
                                               │
                                          ┌────▼────┐
                                          │   cli   │
                                          │   mcp   │
                                          │         │
                                          │ Tier 4  │
                                          │  Ops    │
                                          └─────────┘
```

---

## 스펙 성숙도 상태

| 스펙 | 상태 | 최종 업데이트 | 완성도 | 우선순위 |
|------|--------|--------------|--------------|----------|
| **Tier 1: 기초** |
| glossary.md | Stable | 2026-02-10 | 100% | P0 |
| conventions.md | Stable | 2026-02-10 | 100% | P0 |
| errors.md | Stable | 2026-02-10 | 90% | P0 |
| final.md | Stable | 2026-02-10 | 95% | P0 |
| **Tier 2: 핵심** |
| schema.md | Stable | 2026-02-10 | 85% | P0 |
| auth.md | Stable | 2026-02-10 | 90% | P0 |
| crud.md | Stable | 2026-02-10 | 90% | P0 |
| logics.md | Stable | 2026-02-10 | 80% | P0 |
| **Tier 3: 고급** |
| storage.md | Draft | — | 70% | P1 |
| events.md | Stable | 2026-02-10 | 85% | P0 |
| operator-rbac.md | Draft | — | 75% | P1 |
| client-sdk.md | Draft | — | 70% | P1 |
| **Tier 4: 운영** |
| bridge-hub-protocol.md | Stable | 2026-02-10 | 90% | P0 |
| observability.md | Stable | 2026-02-10 | 85% | P0 |
| audit-log.md | Stable | 2026-02-10 | 85% | P0 |
| cli.md | Draft | — | 60% | P1 |
| mcp.md | Draft | — | 75% | P1 |

### 상태 정의

- **Stable**: 구현에 충분한 스펙, 변경사항은 점진적
- **Draft**: 핵심 구조는 존재하나 중요 섹션이 불완전하거나 TBD
- **Not Started**: 플레이스홀더만 존재, 상당한 작업 필요

### 완성도 가이드

- **90-100%**: 구현 준비 완료, 사소한 명확화만 필요
- **70-89%**: 핵심 개념 정의됨, 세부사항이나 예제 누락
- **50-69%**: 개요 존재, 실질적인 확장 필요
- **< 50%**: 초기 초안, 구현 준비 안 됨

---

## 상호 참조

### 스키마 의존성

대부분의 스펙이 스키마 시스템을 참조:

- **crud.md** → `schema.md` (테이블/컬럼 정의)
- **auth.md** → `schema.md` (권한이 테이블/컬럼 참조)
- **logics.md** → `schema.md` (커스텀 SQL이 스키마에서 작동)
- **events.md** → `schema.md` (이벤트 페이로드가 테이블 스키마와 일치할 수 있음)
- **client-sdk.md** → `schema.md` (SDK 타입이 스키마에서 생성됨)

### 인증 플로우

인증은 여러 스펙에서 참조됨:

- **crud.md** → `auth.md` (작업 전 권한 검사)
- **logics.md** → `auth.md` (커스텀 로직이 사용자 컨텍스트로 실행)
- **events.md** → `auth.md` (핸들러가 서비스 토큰으로 인증)
- **storage.md** → `auth.md` (presigned URL이 인증된 사용자로 범위 지정)
- **mcp.md** → `auth.md` (MCP는 operator 인증 필요)

### 에러 처리

모든 스펙이 에러 카탈로그 참조:

- **crud.md** → `errors.md` (FORBIDDEN, NOT_FOUND 등)
- **auth.md** → `errors.md` (UNAUTHORIZED, INVALID_CREDENTIALS)
- **schema.md** → `errors.md` (중복 테이블에 대한 CONFLICT)
- **events.md** → `errors.md` (SCHEMA_VALIDATION_FAILED)
- **bridge-hub-protocol.md** → `errors.md` (SERVICE_UNAVAILABLE)

### 관찰성 통합

관찰성은 전체에 통합됨:

- **bridge-hub-protocol.md** → `observability.md` (메트릭, 트레이스)
- **auth.md** → `observability.md` (인증 실패 로깅)
- **crud.md** → `observability.md` (요청 트레이스)
- **events.md** → `observability.md` (pub/sub 계측)
- **audit-log.md** → `observability.md` (트레이스와의 상관관계)

---

## 문서 구조

```
plan/
├── spec/              # 기술 명세 (17개 파일)
│   ├── ARCHITECTURE.md    (이 파일)
│   ├── glossary.md        (용어)
│   ├── conventions.md     (표준)
│   ├── errors.md          (에러 카탈로그)
│   ├── final.md           (시스템 설계)
│   ├── schema.md          (DDL 관리)
│   ├── auth.md            (인증)
│   ├── crud.md            (자동 CRUD)
│   ├── logics.md          (커스텀 SQL)
│   ├── storage.md         (파일 스토리지)
│   ├── events.md          (pub/sub, cron)
│   ├── operator-rbac.md   (operator 역할)
│   ├── client-sdk.md      (SDK 설계)
│   ├── bridge-hub-protocol.md (내부 프로토콜)
│   ├── observability.md   (메트릭/로그/트레이스)
│   ├── audit-log.md       (감사 추적)
│   ├── cli.md             (CLI 인터페이스)
│   └── mcp.md             (MCP 통합)
│
├── implement/         # 구현 세부사항
│   └── stack.md       (기술 스택)
│
├── flows/             # 사용자/operator 워크플로우
│   ├── operator.md    (operator 워크플로우)
│   ├── crud.md        (CRUD 플로우)
│   ├── auth.md        (인증 플로우)
│   ├── logics.md      (커스텀 로직 플로우)
│   └── security.md    (보안 제어)
│
├── notes/             # 의사결정 노트
│   └── open-questions.md (미해결 질문)
│
├── overview/          # 컨텍스트
│   └── context.md     (배경, 동기)
│
└── secrets/           # 시크릿 모델
    └── model.md       (시크릿 관리)
```

---

## 관련 문서

### 신규 추가 (확장 스펙)

- **`schema-evolution.md`** — 스키마 마이그레이션 전략, 무중단 배포
- **`limits.md`** — 시스템 제한 및 용량 계획
- **`performance.md`** — 성능 SLO 및 벤치마킹
- **`versioning.md`** — 컴포넌트 버저닝 및 호환성 매트릭스
- **`incident-response.md`** (flows 내) — 에러 복구 플레이북
- **`disaster-recovery.md`** (flows 내) — 백업 및 DR 절차
- **`decision-log.md`** (notes 내) — 해결된 설계 결정 기록
- **`testing.md`** (implement 내) — 테스트 전략 및 커버리지 목표
- **`codegen.md`** (implement 내) — SDK 코드 생성 접근법

### 운영 플레이북

`plan/flows/` 참조:
- **operator.md** — 일상적인 operator 작업
- **incident-response.md** — 문제 해결 및 복구
- **disaster-recovery.md** — 백업, 복원, 장애조치 절차

---

## 빠른 시작 경로

### 신입 엔지니어용 (온보딩)

1. `glossary.md` 읽기 (30분) — 용어 학습
2. `final.md` 훑어보기 (1시간) — 전체 아키텍처 이해
3. `schema.md` + `crud.md` 읽기 (1.5시간) — 핵심 기능
4. `auth.md` 읽기 (1시간) — 보안 모델
5. 담당 영역에 따라 Tier 3 스펙 하나 탐색 (1시간)

**총 소요시간**: 생산적 이해까지 약 4-5시간

### 구현자용 (기능 구축)

1. `ARCHITECTURE.md` 검토 (이 파일) — 탐색
2. 관련 Tier 2 스펙 정독 (schema, auth, crud, logics)
3. 에러 처리 패턴을 위해 `errors.md` 확인
4. 테스트 요구사항을 위해 `testing.md` 확인
5. 계측 요구사항을 위해 `observability.md` 검토

### 운영자용 (시스템 운영)

1. `cli.md` 읽기 — 명령어 참조
2. `bridge-hub-protocol.md` 읽기 — 컴포넌트 통신 방식
3. `observability.md` 읽기 — 모니터링 및 디버깅
4. `incident-response.md` 읽기 — 문제 해결 플레이북
5. `limits.md` 읽기 — 용량 계획

### 보안 검토자용

1. `auth.md` 읽기 — 인증 및 인가 모델
2. `flows/security.md` 읽기 — 보안 제어 및 위협 모델
3. `audit-log.md` 읽기 — 감사 추적 구현
4. `operator-rbac.md` 읽기 — Operator 권한 모델
5. `errors.md` 검토 — 에러 노출 정책

---

## 순환 참조 (의도적)

시스템의 특성상 일부 스펙은 순환 의존성을 가짐:

- **`auth.md` ↔ `crud.md`**: CRUD 작업 중 권한 검사가 이루어지지만, CRUD 작업은 인증 컨텍스트가 필요
- **`schema.md` ↔ `logics.md`**: 커스텀 로직이 스키마에서 작동하지만, 스키마가 커스텀 로직 함수를 참조할 수 있음
- **`events.md` ↔ `logics.md`**: 커스텀 로직이 이벤트를 발행할 수 있고, 이벤트가 커스텀 로직 핸들러를 트리거할 수 있음

이는 런타임에 컴포넌트 간 조정을 담당하는 Bridge에 의해 해결됩니다.

---

## 스펙 업데이트 프로세스

스펙을 업데이트할 때:

1. **상호 참조 확인**: 변경된 섹션을 참조하는 스펙 업데이트
2. **이 파일 업데이트**: 스펙 추가/제거 또는 티어 배치 변경 시
3. **decision-log.md 업데이트**: 결정 및 근거 문서화
4. **성숙도 상태 업데이트**: 완성도 비율 및 최종 업데이트 날짜 반영
5. **하위 호환성 고려**: 중단 변경 사항 문서화

---

## 질문이 있으신가요?

다음에 대한 질문:
- **용어**: `glossary.md` 참조
- **설계 결정**: `notes/decision-log.md` 참조
- **미해결 이슈**: `notes/open-questions.md` 참조
- **구현 세부사항**: `implement/stack.md` 참조

스펙 이슈 보고 또는 개선 제안은 팀에 문의하세요.
