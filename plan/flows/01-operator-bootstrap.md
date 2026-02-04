# Flow 01 — Operator: 최초 세팅(프로젝트/환경/연결/스키마/권한/릴리즈)

목표:
- Operator가 웹 콘솔 없이 `stk`로 Santokit을 “사용 가능한 상태”로 만든다.

전제:
- Hub(Control Plane)와 Bridge(Data Plane)가 이미 배포/실행 중이다.
- Operator는 Hub에 로그인할 수 있다.

---

## A. 로그인 및 컨텍스트 선택

1) Operator 로그인
- `stk login`

2) (선택) 현재 계정 확인
- `stk whoami`

3) repo 컨텍스트 설정(권장)
- `stk context set --hub <hubUrl> --project <project> --env dev --connection main`

---

## B. 프로젝트/환경 생성

1) 프로젝트 생성
- `stk project create <project>`

2) 환경 생성
- `stk env create --project <project> dev`
- `stk env create --project <project> prod`

---

## C. DB 연결 등록 (BYO DB)

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

## D. 스키마 적용(선언 스키마 SoT)

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
