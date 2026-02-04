# Santokit Spec (Final)

이 문서는 Santokit의 “최종 스펙(단일 진실 원천)”이다.

핵심 결정:
- Hub(Control Plane)는 필수. 웹 콘솔 없이 **CLI(`stk`)로만** 운영한다.
- 멀티 팀/프로젝트 지원(멀티테넌트). Bridge(Data Plane)는 단일 공유 런타임이 기본이다.
- 기본 제공 API는 Auto CRUD다.
- BYO DB를 전제로 한다.
- 스키마 Source of Truth는 “선언 스키마(YAML)”이다.
- Data Plane 인증은 Project API key + End User access token을 지원한다.
  - End User 계정관리는 Hub(Control Plane)가 내장으로 제공할 수 있고, 외부 OIDC 연동도 지원한다.
  - 여러 외부 OIDC issuer를 통합(linking/정규화)해 “Santokit access token”으로 교환한다.
  - Bridge(Data Plane)만 Santokit access token을 검증한다.
  - End User `roles`는 access token에 포함한다(Hub 조회 없이 인가).
  - Hub는 access/refresh token을 HttpOnly 쿠키로도 발급할 수 있다(SSR 지원).

---

## 1) Components

### 1.0 Hub (Control Plane)
역할:
- org/team/project/env 관리
- DB connections + secrets 저장(암호화)
- 선언 스키마(YAML) 저장/검증 + schema plan/apply 실행
- schema snapshot 저장(검증/드리프트 감지용)
- permissions / releases 저장
- audit log 저장
- (선택) End User 계정관리 + 토큰 발급(issuer)

용어:
- Operator: Hub(Control Plane)를 운영/관리하는 팀 멤버(사람)
- End User: Bridge(Data Plane)의 `/call`을 호출하는 앱의 최종 사용자(사람)

---

## 2) Repository Layout

원칙:
- `packages/`는 배포/운영/통합에 필요한 모든 deliverable을 담는다.
- 하위 폴더는 “역할(서비스/도구/라이브러리/계약/SDK)”로 구분한다.

권장 구조:
- `packages/services/hub/`
- `packages/services/bridge/`
- `packages/tools/cli/`
- `packages/libs/core/`
- `packages/contracts/` (SDK/서버가 공유하는 계약 아티팩트)
- `packages/sdks/typescript/`
- `packages/sdks/swift/`

### 1.1 CLI (`stk`)
역할:
- 운영(Operator)용 단일 진입점(웹 콘솔 대체)
- Hub API를 호출해 프로젝트/환경/연결정보/권한/릴리즈/스키마 스냅샷을 조작한다

CLI 컨텍스트:
- repo-local context로 `--project/--env` 반복 입력을 줄인다.
- 상세: `plan/spec/cli.md`

Unified apply:
- 최종적으로 사용자는 “프로젝트 스냅샷”을 환경에 반영하는 단일 명령(`stk apply`)을 사용한다.
- 상세: `plan/spec/cli.md`

### 1.2 Bridge (Data Plane Runtime)
역할:
- `/call` API 제공
- 요청에서 `project+env` 컨텍스트를 해석
- Hub에서 현재 릴리즈(permissions + schema IRs(connection별))를 pull/캐시 후 실행
- DB/권한/레이트리밋/감사를 강제한다

멀티 프로젝트:
- “한 Bridge = 여러 프로젝트/환경”이 기본이다.
- 요청은 `X-Santokit-Project`, `X-Santokit-Env` 헤더로 라우팅할 수 있다.
  - API key가 존재하면, key에 바인딩된 `project/env`가 최종 컨텍스트다(불일치 시 `403`).

지원 런타임(필수):
- Node/Docker

---

## 2) Secrets / Connections (Hub / Control Plane)

원칙:
- secret 값은 Git/manifest/bundle/image에 절대 포함하지 않는다.
- secrets/연결정보는 Hub에 저장(암호화)하고 Bridge가 런타임에 조회/캐시한다.

CLI:
- `stk connections set` (환경별 DB 연결정보 설정)
- `stk connections test` (Hub에서 DB 연결 테스트)
- `stk apply --only schema --dry-run --ref <ref>` (선언 스키마 기준 plan; destructive 변경은 차단)
- `stk apply --only schema --ref <ref>` (허용된 subset만 DB에 적용)
- `stk schema snapshot` (Hub가 DB introspection 후 검증/드리프트 감지)

---

## 3) Permissions & Releases

### 3.1 Permissions
의미:
- `config/permissions.yaml` 기반 테이블/컬럼 레벨 권한을 적용한다.
- 상세: `plan/spec/crud.md`

### 3.2 Schema
의미:
- 선언 스키마(YAML)가 Source of Truth다.
- Hub(Control Plane)가 plan/apply를 실행한다(Operator가 CLI로 트리거).
- destructive 변경은 허용하지 않는다.
- DB 드리프트가 있으면 릴리즈를 차단한다.
- 상세: `plan/spec/schema.md`

### 3.3 Releases (ReleaseId / Pointers)
정의:
- `releaseId`는 “스키마 IR + 권한 + 기타 설정”을 묶은 **불변 스냅샷 식별자**다.
- 각 `env`는 “current release” 포인터를 가진다.

원칙:
- `stk apply`는 성공 시 해당 env의 current 포인터를 어떤 `releaseId`로 맞춘다.
- Hub는 `apply`를 멱등으로 처리한다:
  - 입력 스냅샷이 완전히 동일하면 **새 `releaseId`를 만들지 않고** 기존 `releaseId`를 재사용한다.
  - 스냅샷이 달라지면 새로운 `releaseId`를 만든다.
- `stk release promote`는 새로운 `releaseId`를 만들지 않고, to-env 포인터만 from-env의 `releaseId`로 이동한다.

### 3.4 Release Model (Hub(Control Plane)-backed)
의미:
- Release는 “특정 `project+env`에 적용되는” 설정 번들이다:
- permissions 버전
- schema 버전(선언 스키마) + 적용 상태 (connection별)
- Bridge(Data Plane)는 요청 처리 시점에 현재 릴리즈를 pull/캐시한다.

#### 3.4.1 GitOps Flow (권장)
원칙:
- “환경(dev/stg/prod)”은 **프로젝트 내부의 env**로 관리한다. env마다 프로젝트를 새로 만들지 않는다.
- Git 브랜치는 env에 매핑될 수 있다(예: `develop → dev`, `main → prod`).

Bootstrap:
1) 운영자가 한 번만 생성:
   - `stk project create <project>`
   - `stk env create --project <project> dev|stg|prod`
   - `stk context set --project <project> --env <env> --connection main`
   - `stk connections set --name main --engine postgres --db-url <...>`
   - (선택) 추가 DB:
     - `stk connections set --name analytics --engine postgres --db-url <...>`
   - `stk apply --ref <ref>`
     - 출력에 `releaseId`가 포함된다(성공 시).

Deploy (CI):
- `develop` 브랜치 파이프라인:
  - `stk apply --project <project> --env dev --ref <ref>`
- `main` 브랜치 파이프라인:
  - `stk apply --project <project> --env prod --ref <ref>`

Promotion (dev → prod):
- (current 승격) `stk release promote --project <project> --from dev --to prod`
- (명시 승격) `stk release promote --project <project> --to prod --release-id <releaseId>`
  - 의미: 특정 릴리즈(또는 from env의 current)를 to env로 승격한다(릴리즈 포인터 이동).
  - 효과:
    - to env의 current 포인터를 해당 `releaseId`로 이동한다.
    - 단, to env의 DB(connection별)가 해당 릴리즈의 schema와 **호환/적용 완료** 상태여야 한다(드리프트/미적용이면 승격 실패).
    - 스키마 적용은 별도로 `stk apply --project <project> --env prod --only schema --ref <ref>`로 수행한다.
      - `ref`는 `stk release show --release-id <releaseId>`로 확인한다.
  - `releaseId` 조회:
    - `stk release current --project <project> --env dev`
    - `stk release list --project <project> --env dev`

Rollback (prod):
- `stk release rollback --project <project> --env prod --to <previousReleaseId>`
  - 의미: prod의 “현재 릴리즈” 포인터를 이전 릴리즈로 되돌린다.

---

## 6) Runtime API (Bridge / Data Plane)

### 6.1 `POST /call`
입력:
```json
{ "path": "db/users/select", "params": { "where": { "id": "..." }, "limit": 1 } }
```

인증(데이터 플레인):
- 서버/CI: `X-Santokit-Api-Key: <api_key>`
- End User:
  - `Authorization: Bearer <santokit_access_token>` 또는
  - 쿠키: `stk_access_<project>_<env>=<santokit_access_token>` (HttpOnly)
- 상세: `plan/spec/auth.md`

컨텍스트(멀티 프로젝트/환경):
- 요청 헤더로 `project`와 `env`를 명시할 수 있다.
  - `X-Santokit-Project: <project>`
  - `X-Santokit-Env: <env>`

보안 규칙(필수):
- API key가 존재하면: key에 바인딩된 `project/env`가 최종 컨텍스트다(헤더 불일치 시 `403`).
- API key도 없고 End User access token도 없으면 `401`.
- End User access token의 `projectId/envId` 바인딩이 라우팅 힌트보다 우선하며, 불일치 시 `403`.

Credential extraction(권장 규칙):
1) `X-Santokit-Api-Key`가 있으면 서버/CI 호출로 간주하고 API key를 사용한다.
2) 아니면 `Authorization: Bearer ...`가 있으면 End User access token으로 사용한다.
3) 아니면 `X-Santokit-Project`, `X-Santokit-Env`로 `project/env`를 결정한 뒤,
   쿠키 `stk_access_<project>_<env>`에서 access token을 읽는다.

처리 파이프라인(최소):
1) `path`가 Auto CRUD인지 확인: `db/{table}/{op}`
2) API key 검증 + `project/env` 컨텍스트 확정
3) 현재 릴리즈 로드(permissions + schema IRs(connection별))
4) permissions 체크
5) params 검증
6) `{table}` → connection 룩업 → 해당 connection의 schema IR/permission으로 SQL 생성 + 실행
7) 결과/에러 반환

에러 포맷(초안):
```json
{ "error": { "code": "BAD_REQUEST", "message": "...", "requestId": "..." } }
```

### 6.2 Auto CRUD
핵심 기능이다.

- `path`: `db/{table}/{op}`
- 상세 스펙: `plan/spec/crud.md`

---

## 7) Open Questions

- Multi-runtime(Workers 등) 지원 범위
- Postgres 외 DB 엔진 지원 범위
