# Schema Source Options (Postgres + libsql/D1, BYO DB)

요구사항(사용자 입력):
- DB: Postgres + libsql(+ Cloudflare D1) 지원
- 모델: BYO DB (플랫폼이 DB를 직접 프로비저닝하지 않음)
- 선호: “migration.sql 폴더” 직접 관리 말고, **config 기반/더 나은 스키마 소스** 가능하면 채택

---

## 핵심 현실 체크

- Postgres와 libsql/D1(= SQLite 계열)은 DDL 기능/타입/제약이 다르다.
- “하나의 선언적 소스”로 양쪽을 커버하려면:
  - 공통 분모(테이블/컬럼/인덱스/기본 FK 정도)만 MVP에서 지원하거나
  - 엔진별 확장 필드를 허용해야 한다.

---

## Option A) Santokit Schema Config (권장: 내부 IR + 엔진별 컴파일)

### 아이디어
`schema/*.yaml` 같은 **선언적 설정(중립 IR)** 을 Source of Truth로 두고,
Hub가 이를 파싱해서 **엔진별 DDL**(또는 migration plan)을 생성/적용한다.

예시(스케치):
```yaml
version: 1
databases:
  main:
    engine: postgres # or sqlite
tables:
  users:
    columns:
      id: { type: string, pk: true }
      email: { type: string, unique: true, nullable: false }
      created_at: { type: timestamp, default: now }
```

### 장점
- “config 기반” 요구를 직접 만족
- Client/CRUD/permissions 같은 상위 기능(Auto CRUD)에 필요한 “스키마 모델”을 Hub가 항상 보유
- 장기적으로 Hub가 스키마 diff/plan/apply를 표준화하기 쉬움

### 단점/리스크
- 우리가 **스키마 DSL/IR**를 설계해야 함(초기 비용)
- Postgres/SQLite 차이를 흡수하는 규칙이 필요(타입 매핑, 제약, default 함수 등)

### MVP 스코프 제안(공통 분모)
- tables, columns, pk, basic unique, basic index, simple fk
- 타입은 “logical type”으로 제한: `string|int|bigint|float|boolean|json|timestamp|bytes`
- 엔진별 raw escape 제공:
  - `postgres:` 블록에 raw sql/default
  - `sqlite:` 블록에 raw sql/default

### Format Decision (YAML)
결정(2026-02-04):
- MVP 스키마 포맷은 **YAML로 고정**한다. (TOML 미지원)
  - 예: `schema/main.yaml`을 공식 스펙/템플릿으로 사용
  - 파서는 `.yaml`/`.yml`만 입력으로 허용

---

## Option B) Prisma Schema (외부 DSL 채택)

### 아이디어
`schema.prisma`를 Source of Truth로 사용하고,
Hub/CLI는 Prisma의 생성물(또는 마이그레이션 출력)을 활용한다.

### 장점
- 선언적 스키마 소스(요구 충족)
- Postgres/SQLite를 모두 다루는 방향성이 있음(도구 생태계)

### 단점
- Prisma 런타임/마이그레이션 체인에 대한 의존이 생김
- D1/libsql 특이점(제약/PRAGMA/기능 차이)을 얼마나 깔끔하게 흡수할지 불확실
- “Hub가 plan/apply 한다”는 기존 아키텍처와 결이 달라질 수 있음(외부 툴 오케스트레이션이 됨)

---

## Option C) TypeScript Schema (Drizzle/Kysely 스타일)

### 아이디어
스키마를 TS 코드로 정의하고(정적 분석 가능한 형태),
Hub/CLI가 이를 실행/해석해 엔진별 DDL을 생성한다.

### 장점
- 개발자 경험이 좋음(자동완성/리팩터링)
- 앱 코드와 스키마를 같은 언어로 관리 가능

### 단점
- Hub가 TS 실행/샌드박싱/버전 고정 문제를 떠안음
- “선언적 config”보다는 “코드”에 가까움

---

## Option D) Atlas HCL (현 docs 베이스라인)

### 아이디어
`schema/*.hcl`을 유지하고, Hub가 plan/apply를 담당.

### 장점
- 이미 문서/흐름이 존재(변경 폭 최소)
- 선언적 소스

### 단점
- Postgres+SQLite 계열을 동일한 방식으로 처리할 수 있는지는 확인/검증이 필요
- config 기반 요구(YAML)와는 결이 다름(HCL)

---

## BYO DB 관점에서 꼭 정해야 하는 것

1) 연결 정보는 어디에 두나?
- Hub secrets에 저장(`DB_URL`, `DB_AUTH_TOKEN` 등)
- 환경별(dev/stg/prod)로 스코프 분리할지

2) schema apply는 “어디서 실행”되나?
- Hub가 직접 DB에 연결해서 적용(네트워크 접근 필요)
- 사용자가 CI에서 실행하고 Hub는 plan/검증만(또는 스냅샷만) 저장

3) 엔진 혼합 지원 방식
- 프로젝트당 DB 엔진 1개 고정 vs “DB alias마다 엔진이 다름”(main=pg, analytics=sqlite 등)

---

## Recommendation (내 제안)

재창조 MVP에선:
- 스키마 소스: **Option A (Santokit Schema Config + 엔진별 컴파일)** 로 가되
- 당장 구현 부담을 줄이기 위해:
  - 공통 분모만 지원
  - 엔진별 raw escape 허용
  - apply는 “Hub가 직접 DB에 연결”을 1차로(단, BYO DB 환경에서 네트워크 이슈가 있으면 CI 실행 모델로 전환)

---

## Decision Questions (다음 Q&A)

1) 스키마 소스를 A/B/C/D 중 무엇으로 할까?
2) apply 실행 주체: Hub 직접 적용 vs CI 실행(사용자 환경)
3) DB 연결 스코프: 단일 env만(MVP) vs env 분리(dev/stg/prod)
