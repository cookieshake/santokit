# Operator Flows

## Flow 01 — 최초 세팅(프로젝트/환경/연결/스키마/권한/릴리즈)

목표:
- Operator가 웹 콘솔 없이 `stk`로 Santokit을 "사용 가능한 상태"로 만든다.

전제:
- Hub(Control Plane)와 Bridge(Data Plane)가 이미 배포/실행 중이다.
- Operator는 Hub에 로그인할 수 있다.

---

### A. 로그인 및 컨텍스트 선택

1) Operator 로그인
- `stk login`

2) (선택) 현재 계정 확인
- `stk whoami`

3) repo 컨텍스트 설정(권장)
- `stk context set --hub <hubUrl> --project <project> --env dev --connection main`

---

### B. 프로젝트/환경 생성

1) 프로젝트 생성
- `stk project create <project>`

2) 환경 생성
- `stk env create --project <project> dev`
- `stk env create --project <project> prod`

---

### C. DB 연결 등록 (BYO DB)

1) connection 등록
- (dev) `stk connections set --name main --engine postgres --db-url <...>`
- (prod) `stk connections set --project <project> --env prod --name main --engine postgres --db-url <...>`
- (선택) 추가 DB connection 등록(예: analytics)
  - (dev) `stk connections set --name analytics --engine postgres --db-url <...>`
  - (prod) `stk connections set --project <project> --env prod --name analytics --engine postgres --db-url <...>`

2) 연결 테스트
- (dev) `stk connections test --name main`
- (prod) `stk connections test --project <project> --env prod --name main`
- (선택) `stk connections test --name analytics`

---

### D. 스키마 적용(선언 스키마 SoT)

1) 선언 스키마 준비
- repo에 `schema/*.yaml`을 둔다. (형식: `plan/spec/schema.md`)
  - 각 파일은 `connection: <name>`을 포함한다(멀티 DB 지원).

2) 프로젝트 스냅샷 반영(권장: 단일 명령)
- (dev) `stk apply --ref <ref>`
- (prod) `stk apply --project <project> --env prod --ref <ref>`

포함되는 작업:
- 스키마 validate/plan/apply (destructive 변경은 금지)
- 드리프트 체크(드리프트면 릴리즈 차단)
- permissions apply
- release create

---

## Flow 02 — Project API Key 발급/회전/폐기

목표:
- 서버/CI 등 "서비스 호출자"용 Project API key를 운영한다.

전제:
- Operator가 Hub(Control Plane)에 로그인했다.

---

### A. 키 생성

- (context 사용) `stk apikey create --name <name> --roles <role1,role2,...>`
- (명시) `stk apikey create --project <project> --env <env> --name <name> --roles <role1,role2,...>`

출력:
- `keyId=...`
- `apiKey=...` (생성 시 1회만 노출)

---

### B. 키 목록/상태 확인

- (context 사용) `stk apikey list`
- (명시) `stk apikey list --project <project> --env <env>`

권장 필드:
- `keyId`, `name`, `roles`, `status`, `createdAt`, `lastUsedAt`

---

### C. 무중단 회전(권장)

1) 새 키 생성
- `stk apikey create ...`

2) 서버/CI에 새 키 배포

3) 기존 키 폐기
- (context 사용) `stk apikey revoke --key-id <keyId>`
- (명시) `stk apikey revoke --project <project> --env <env> --key-id <keyId>`

---

### D. 폐기(즉시 차단)

- (context 사용) `stk apikey revoke --key-id <keyId>`
- (명시) `stk apikey revoke --project <project> --env <env> --key-id <keyId>`

---

## Flow 06 — 스키마 변경 → plan/apply → 드리프트 차단(Release gate)

목표:
- 선언 스키마(YAML)를 변경하고 DB에 안전하게 반영한다.
- destructive 변경은 허용하지 않는다.
- DB가 수동 변경되어 드리프트가 생기면 릴리즈를 차단한다.

전제:
- 스키마 파일은 repo의 `schema/*.yaml`에 존재한다.

---

### A. 스키마 변경(PR)

1) `schema/*.yaml` 수정
2) PR 생성

---

### B. 검증/계획(plan)

권장:
- 스키마만 검증/plan을 보고 싶으면 `stk apply --only schema --dry-run`을 사용한다.

예:
- (context 사용) `stk apply --only schema --dry-run --ref <ref>`
- (명시) `stk apply --project <project> --env <env> --only schema --dry-run --ref <ref>`

멀티 connection 주의:
- 기본 동작은 `schema/*.yaml`에 선언된 모든 table(connection별)에 대해 plan을 생성한다.

3) destructive 포함 여부 확인
- destructive가 포함되면 plan은 "차단"되어야 한다.

---

### C. 적용(apply)

권장:
- 스키마 변경을 DB에 적용하려면 `stk apply --only schema`를 사용한다.

예:
- (context 사용) `stk apply --only schema --ref <ref>`
- (명시) `stk apply --project <project> --env <env> --only schema --ref <ref>`

---

### D. 드리프트 감지 및 릴리즈 차단

정책:
- DB 상태가 선언 스키마와 다르면 릴리즈를 차단한다.

운영 플로우:
1) 드리프트 원인 파악
2) (선택1) 선언 스키마에 반영 + plan/apply
3) (선택2) DB를 선언 스키마 상태로 복구 + plan/apply
4) 드리프트 해소 후 릴리즈 수행

---

## Flow 07 — 권한 변경(permissions.yaml) → 릴리즈

목표:
- 권한 정책을 GitOps로 변경하고 릴리즈로 반영한다.

전제:
- 권한 파일은 repo의 `config/permissions.yaml`에 존재한다.

---

### A. 권한 변경(PR)

1) `config/permissions.yaml` 수정
2) PR 생성

---

### B. 적용 및 릴리즈

권장:
- 권한만 반영하고 릴리즈까지 만들려면 `stk apply --only permissions,release`를 사용한다.

예:
- (context 사용) `stk apply --only permissions,release --ref <ref>`
- (명시) `stk apply --project <project> --env <env> --only permissions,release --ref <ref>`

멀티 connection 주의:
- `config/permissions.yaml`은 table 단위 정책을 가진다(예: `tables.users`).
- 각 table이 어떤 connection(DB)에 속하는지는 스키마(`schema/*.yaml`)에서 결정된다.

주의:
- 권한 변경은 End User 토큰의 `roles` 설계(토큰 TTL)와 상호작용한다.
  - 토큰에 `roles`가 포함되므로, "즉시 권한 변경"은 토큰 재발급/짧은 TTL이 필요할 수 있다.

---

## Flow 08 — 릴리즈 승격(Promotion) 및 롤백

목표:
- dev에서 검증된 릴리즈를 prod로 승격한다.
- 문제 발생 시 이전 릴리즈로 롤백한다.

---

### A. 승격(dev → prod)

- (current 승격) `stk release promote --project <project> --from dev --to prod`
- (명시 승격) `stk release promote --project <project> --to prod --release-id <releaseId>`

의미:
- dev의 릴리즈를 prod로 승격한다(릴리즈 포인터 이동).
- 승격은 DB에 스키마를 "적용"하지 않는다.
  - to env의 DB가 해당 릴리즈 schema와 호환/적용 완료 상태가 아니면 승격은 실패해야 한다.
  - 필요하면 먼저 `stk apply --project <project> --env prod --only schema --ref <ref>`로 스키마를 적용한다.
    - `ref`는 `stk release show --release-id <releaseId>`로 확인한다.

`releaseId`는 어디서 얻나:
- `releaseId`는 dev 환경에 대해 `stk apply`(또는 `stk apply --only ...,release`)가 성공했을 때 Hub가 생성/확정한다.
- 보통은 "current 승격"을 쓰면 되고, 특정 버전을 재승격/핀하고 싶을 때만 `--release-id`를 쓴다.
- 조회 방법(예시):
  - `stk release current --project <project> --env dev`
  - `stk release list --project <project> --env dev --limit 20`

---

### B. 롤백(prod)

- `stk release rollback --project <project> --env prod --to <previousReleaseId>`

의미:
- prod의 "현재 릴리즈" 포인터를 이전 릴리즈로 되돌린다.
- 이 동작은 **release rollback(포인터 이동)**이며, DB 스키마 자체를 되돌리는 **schema rollback**과 다르다.

---

## 공통 완료 기준 템플릿

각 Flow는 아래 기준을 최소 포함하도록 유지한다.
- 요청 예시: 실제 CLI 명령 1개 이상 제시
- 성공 기준: 기대 결과(`releaseId` 생성, 포인터 이동, 권한 반영 등) 명시
- 실패 기준: 최소 1개 부정 케이스와 기대 실패 조건(예: drift, 권한 불일치) 제시
