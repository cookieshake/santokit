# CLI (`stk`) Context — Spec

목표:
- Operator가 매 명령마다 `--project/--env`를 반복 입력하지 않도록 한다.
- CI/스크립트에서는 `--project/--env`를 명시해 재현성을 유지한다.
- 스키마/권한/릴리즈 등 “프로젝트 스냅샷”을 한 번에 반영할 수 있어야 한다.

---

## 1) Repo Context

Repo-local context는 프로젝트 리포지토리의 `.stk/` 아래에 저장한다.

권장 파일:
- `.stk/context.json`

예시:
```json
{
  "hubUrl": "https://hub.example.com",
  "project": "myapp",
  "env": "dev",
  "connection": "main"
}
```

원칙:
- repo context가 존재하면, `stk`는 기본값으로 이를 사용한다.
- 명령에 `--project/--env`가 명시되면 repo context보다 우선한다.
- `hubUrl`이 존재하면, `stk`는 해당 Hub를 기본 대상으로 사용한다.
- `--hub <url>`이 명시되면 repo context의 `hubUrl`보다 우선한다.
- `connection`은 “기본 connection(편의)”이다:
  - `stk connections set/test` 같은 커맨드의 기본 대상으로 사용한다.
  - 스키마 적용은 `schema/*.yaml`의 `connection:` 선언을 기준으로 한다.

---

## 2) Commands (Draft)

### 2.1 Set / Show
- `stk context set --hub <url> --project <project> --env <env> [--connection <name>]`
- `stk context show`

### 2.2 Clear
- `stk context clear`

---

## 3) Unified Apply (Project Snapshot)

문제:
- 시간이 지날수록 `stk schema apply`, `stk permissions apply`, `stk release create` 같은 “apply 계열”이 늘어난다.
- 사용자가 “이번 커밋 상태를 환경에 반영”하고 싶을 때 명령이 분산되면 실수/누락이 잦아진다.

해결:
- `stk apply` 한 번으로 “repo 상태(스키마/권한 등)”를 Hub(Control Plane)에 반영하고,
  릴리즈까지 생성하는 unified command를 제공한다.

입력(기본 규약):
- 선언 스키마: `schema/*.yaml`
- 권한: `config/permissions.yaml`
- (선택) 기타 설정: `config/*.yaml`

명령:
- `stk apply --ref <ref>` (권장: 현재 커밋 SHA)

동작(순서, 권장):
1) schema validate
2) schema plan + (옵션) schema apply
3) drift check (드리프트면 실패)
4) permissions apply
5) release create

릴리즈 생성 규칙:
- `stk apply`는 기본적으로 `release create`까지 수행한다(= 성공 시 `releaseId`가 생성/확정된다).
- `--only schema`처럼 `release` 단계가 제외되면 `releaseId`는 생성되지 않는다.
- Hub는 `apply`를 **멱등**으로 처리할 수 있어야 한다:
  - 동일한 입력(`project/env/ref` + 스냅샷 내용)이면 같은 `releaseId`를 반환한다.
  - 스냅샷 내용이 달라지면 새로운 `releaseId`를 생성한다.

옵션(초안):
- `--only schema|permissions|release` (부분 반영)
  - 다중 단계를 쉼표로 함께 지정할 수 있다. 예: `--only permissions,release`
- `--force` (파괴적 스키마 변경 허용)
- `--no-schema-apply` (plan/검증만; DB 변경 없이 릴리즈는 차단)
- `--dry-run` (Hub에 반영하지 않고 plan/검증 결과만 출력)
- `--json` (기계가 파싱하기 쉬운 출력; 예: `releaseId`, `ref`, 단계별 결과)

원칙:
- destructive 변경은 apply에서 항상 차단된다.
- drift가 있으면 릴리즈는 차단된다.
- CI에서는 `--project/--env/--ref`를 명시한다.

멀티 connection 원칙:
- 스키마에서 table마다 connection(DB)을 선언할 수 있다.
- `release` 단계(= releaseId 생성/확정)는 “프로젝트 스냅샷 전체”를 대상으로 한다(테이블 일부만 대상으로 한 release는 만들지 않는다).

---

## 4) Behavior

- repo context가 없고 `--project/--env`도 없으면:
  - 기본 동작은 에러로 종료한다(명시적으로 설정하도록 유도)
  - 옵션으로 인터랙티브 선택(prompt)을 추가할 수 있다.
- repo context에 `hubUrl`이 없고 `--hub`도 없으면:
  - 기본 동작은 에러로 종료한다(명시적으로 설정하도록 유도)

---

## 5) CI Guidance

CI에서는 다음을 권장한다:
- repo context에 의존하지 않는다.
- 모든 `stk` 명령에 `--project/--env`를 명시한다.

---

## 6) Release Commands (Operator/CI)

`releaseId`를 “어디서 얻는가”를 명확히 하기 위한 최소 커맨드 셋:

- `stk release current`  
  - 현재 컨텍스트(`project/env`)의 “current release”를 출력한다.
- `stk release list [--limit N]`  
  - 환경의 릴리즈 히스토리를 최신순으로 나열한다(`releaseId`, `ref`, `createdAt`, `status` 등).
- `stk release show --release-id <releaseId>`  
  - 해당 릴리즈가 가리키는 스냅샷(스키마/권한 버전, ref 등)을 출력한다.
- `stk release promote --from <env> --to <env> [--release-id <releaseId>]`
  - 릴리즈를 재생성하지 않고 대상 환경의 current release 포인터를 이동한다.
- `stk release rollback --to-release-id <releaseId>`
  - 현재 환경의 current release 포인터를 지정한 이전 릴리즈로 되돌린다.
