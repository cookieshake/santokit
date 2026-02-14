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
10. **`operator-rbac.md`** — Operator 권한 (org/project 역할)
11. **`client-sdk.md`** — 클라이언트 라이브러리 (TypeScript SDK)

### Tier 4: 운영

운영 관련 사항 및 도구:

12. **`bridge-hub-protocol.md`** — 내부 통신 (Bridge ↔ Hub)
13. **`cli.md`** — CLI 인터페이스 (`stk` 명령어)
14. **`mcp.md`** — MCP 통합 (스키마/권한/릴리즈/로직 인트로스펙션)

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
    ┌───▼────┐         ┌────▼────┐        ┌────▼────┐
    │storage │         │operator │        │ bridge  │
    │        │         │ -rbac   │        │  -hub   │
    │ Tier 3 │         │         │        │         │
    │Advanced│         │ Tier 3  │        │ Tier 4  │
    └────┬───┘         └────┬────┘        │Internal │
         │                  │             └────┬────┘
         │                  │                  │
         └──────────┬───────┘                  │
                    │                          │
               ┌────▼────┐                     │
               │ client  │                     │
               │  -sdk   │                     │
               │         │                     │
               │ Tier 4  │                     │
               │External │                     │
               └─────────┘              ┌──────┴──────┐
                                        │             │
                                   ┌────▼────┐   ┌────▼────┐
                                   │   cli   │   │   mcp   │
                                   │         │   │         │
                                   │ Tier 4  │   │ Tier 4  │
                                   │  Ops    │   │  Ops    │
                                   └─────────┘   └─────────┘
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
| storage.md | Draft | TBD | 70% | P1 |
| operator-rbac.md | Draft | TBD | 75% | P1 |
| **Tier 4: 통합/운영** |
| bridge-hub-protocol.md | Stable | 2026-02-10 | 90% | P0 |
| client-sdk.md | Draft | TBD | 70% | P1 |
| cli.md | Draft | TBD | 60% | P1 |
| mcp.md | Draft | TBD | 75% | P1 |

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
- **client-sdk.md** → `schema.md` (SDK 타입이 스키마에서 생성됨)

### 인증 플로우

인증은 여러 스펙에서 참조됨:

- **crud.md** → `auth.md` (작업 전 권한 검사)
- **logics.md** → `auth.md` (커스텀 로직이 사용자 컨텍스트로 실행)
- **storage.md** → `auth.md` (presigned URL이 인증된 사용자로 범위 지정)
- **mcp.md** → `auth.md` (MCP는 operator 인증 필요)

### 에러 처리

모든 스펙이 에러 카탈로그 참조:

- **crud.md** → `errors.md` (FORBIDDEN, NOT_FOUND 등)
- **auth.md** → `errors.md` (UNAUTHORIZED)
- **schema.md** → `errors.md` (중복 테이블에 대한 CONFLICT)
- **bridge-hub-protocol.md** → `errors.md` (SERVICE_UNAVAILABLE)

### 관찰성 통합

관찰성(로그/메트릭/트레이스)은 런타임 구현에서 다룬다.
본 문서 묶음에서는 “민감정보 노출 금지” 같은 최소 보안 규칙을 각 스펙(auth/protocol/crud/storage)에 포함한다.

---

## 문서 구조

```
plan/
├── spec/              # 기술 명세
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
│   ├── operator-rbac.md   (operator 역할)
│   ├── client-sdk.md      (SDK 설계)
│   ├── bridge-hub-protocol.md (내부 프로토콜)
│   ├── cli.md             (CLI 인터페이스)
│   └── mcp.md             (MCP 통합)
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

- **`decision-log.md`** (notes 내) — 해결된 설계 결정 기록

### 운영 플레이북

`plan/flows/` 참조:
- **operator.md** — 일상적인 operator 작업

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
4. (선택) 운영/디버깅 요구사항을 위해 `bridge-hub-protocol.md`의 장애 모드/민감정보 규칙을 확인

### 운영자용 (시스템 운영)

1. `cli.md` 읽기 — 명령어 참조
2. `bridge-hub-protocol.md` 읽기 — 컴포넌트 통신 방식
3. `mcp.md` 읽기 — 운영/개발 보조 도구

### 보안 검토자용

1. `auth.md` 읽기 — 인증 및 인가 모델
2. `flows/security.md` 읽기 — 보안 제어 및 위협 모델
3. `operator-rbac.md` 읽기 — Operator 권한 모델
4. `errors.md` 검토 — 에러 노출 정책

---

## 런타임 의존성 vs 문서 의존성

일부 스펙 간에는 런타임 상호작용이 존재:

- **`auth.md` ↔ `crud.md`**: CRUD 작업은 권한 검사를 수행하고, 권한 검사는 인증 컨텍스트를 사용
- **`schema.md` ↔ `logics.md`**: 커스텀 로직은 스키마 테이블을 참조하고, 스키마는 로직 실행 결과를 사용 가능

이러한 상호작용은 런타임에 Bridge가 조정하며, 문서 간 순환 참조를 의미하지 않음. 각 스펙은 독립적으로 읽을 수 있도록 작성됨.

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

스펙 이슈 보고 또는 개선 제안은 팀에 문의하세요.
