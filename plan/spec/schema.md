# Schema (Declarative YAML) — Spec

목표:
- Santokit의 스키마 Source of Truth는 선언 스키마(YAML)이다.
- Hub(Control Plane)가 선언 스키마를 기준으로 DB에 대해 **plan/apply**를 수행한다.
- destructive 변경은 허용하지 않는다.
- DB가 수동으로 변경되어 스키마 드리프트가 발생하면 **릴리즈를 차단**한다.

---

## 1) Source of Truth & Artifacts

Source of Truth:
- `schema/*.yaml` (YAML)

Hub가 생성/저장하는 파생 아티팩트:
- `schema_ir`(connection별): 선언 스키마를 파싱/검증한 내부 IR(엔진 중립)
- `ddl_plan`(connection별): 특정 DB 엔진(Postgres 등)에 대한 적용 계획(plan)
- `schema_snapshot`(connection별): 실제 DB 인트로스펙션 결과(검증/드리프트 감지용)

원칙:
- CRUD 실행은 `schema_ir`를 기준으로 한다.
- DB 인트로스펙션은 “검증/드리프트 감지/plan 계산” 목적이다.

---

## 2) YAML Format (Base Only)

파일 예시(스케치):
```yaml
version: 1

tables:
  users:
    connection: main
    primary_key: [id]
    columns:
      id: { type: string, nullable: false }
      email: { type: string, nullable: false, unique: true }
      created_at: { type: timestamp, nullable: false, default: now }
    indexes:
      - columns: [email]
        unique: true
```

의미:
- `tables.<name>.connection`은 Hub에 등록된 connection name을 가리킨다.
- DB 엔진(`postgres` 등)은 **connection 설정**으로부터 결정한다(스키마 YAML에 엔진을 쓰지 않는다).

멀티 connection:
- 한 프로젝트가 여러 DB(connection)를 사용할 수 있다.
- `schema/*.yaml`는 여러 파일로 구성될 수 있다.
- Hub는 `tables.<name>.connection` 기준으로 테이블을 그룹핑해 `connection → schema_ir`을 만든다.
- 프로젝트 스키마 전체에서 `tables.<name>`은 **전역 유니크**여야 한다(충돌 시 에러).
- connection 간 foreign key/참조는 최종 스펙 범위 밖이다(= cross-DB 관계 금지).

기본형(Base)만 지원한다:
- tables / columns / primary_key / unique / indexes / (optional) foreign keys
- 타입은 “logical type” 집합으로 제한한다.
- 엔진별 raw SQL escape/확장 필드는 최종 스펙 범위 밖으로 둔다.

---

## 3) Logical Types (Core)

목표: 여러 DB 엔진으로 컴파일 가능한 공통 타입 집합을 유지한다.

Core types:
- `string`
- `int`
- `bigint`
- `float`
- `boolean`
- `json`
- `timestamp`
- `bytes`

엔진별 매핑은 Hub가 담당한다.

---

## 4) Plan / Apply (Hub 실행)

명령 주체:
- Operator가 `stk`로 Hub에 트리거한다.

CLI (최종 표면):
- `stk apply --only schema --dry-run --ref <ref>`
  - YAML 파싱/규칙 검증 + 엔진별 컴파일 가능성 확인
  - Hub가 DB 인트로스펙션 → diff → plan 생성(출력)
- `stk apply --only schema --ref <ref>`
  - Hub가 “허용된 subset”만 DB에 적용

멀티 connection 동작:
- `schema/*.yaml`에 등장하는 모든 connection에 대해 plan/apply를 수행한다.

허용되는 apply subset(비파괴):
- create table
- add column (안전한 조건에서만)
- create index

금지(Destructive):
- drop table/column/index
- rename table/column
- column type change
- nullable 감소(예: nullable=true → false)
- 의미가 불명확한 변경은 기본적으로 차단

---

## 5) Drift Policy (Release Gate)

드리프트 정의:
- 선언 스키마 기준 예상 상태와 실제 DB 상태가 다를 때

정책:
- 드리프트가 존재하면 해당 `project+env`에 대해 “릴리즈 생성/승격”을 차단한다.
  - 예: `stk apply`가 `release` 단계를 포함하면 실패해야 한다.
  - 예: `stk release promote`는 실패해야 한다.
- Operator는 먼저 `stk apply --only schema ...`로 정합성을 회복하거나, 선언 스키마를 수정해야 한다.

멀티 connection:
- 드리프트는 connection별로 판단한다.
- `schema/*.yaml`에 포함된 connection 중 하나라도 드리프트가 있으면 릴리즈 생성/승격을 차단한다.

---

## 6) Multi-Engine Note

DB 엔진은 추후 추가될 수 있다.
원칙:
- YAML은 엔진 중립을 유지한다(핵심 logical types + base primitives).
- 엔진별 차이가 큰 기능은 최종 스펙에 포함하지 않는다.
