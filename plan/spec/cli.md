# CLI (`stk`) Context — Spec

## 1) Repo Context

Repo-local context는 프로젝트 리포지토리의 `.stk/` 아래에 저장한다.

파일: `.stk/context.json`

```json
{
  "hubUrl": "https://hub.example.com",
  "project": "myapp",
  "env": "dev",
  "connection": "main"
}
```

우선순위 규칙:
- repo context가 존재하면 `stk`는 기본값으로 이를 사용한다.
- `--project` / `--env`가 명시되면 repo context보다 우선한다.
- `--hub <url>`이 명시되면 repo context의 `hubUrl`보다 우선한다.
- `connection`: `stk connections set/test` 같은 커맨드의 기본 대상으로 사용한다. 스키마 적용은 `schema/*.yaml`의 `connection:` 선언을 기준으로 한다.

---

## 2) Context Commands

- `stk context set --hub <url> --project <project> --env <env> [--connection <name>]`
- `stk context show`
- `stk context clear`

---

## 3) Unified Apply (`stk apply`)

`stk apply` 한 번으로 repo 상태(스키마/권한)를 Hub에 반영하고 릴리즈까지 생성하는 unified command.

입력:
- 선언 스키마: `schema/*.yaml`
- 권한: `config/permissions.yaml`

실행 순서:
1. schema validate
2. schema plan + (옵션) schema apply
3. drift check (드리프트면 실패)
4. permissions apply
5. release create

### 플래그

| 플래그 | 의미 |
|--------|------|
| `--ref <ref>` | 현재 커밋 SHA. 릴리즈 메타데이터에 기록된다. |
| `--only schema\|permissions\|release` | 지정된 단계만 실행. 쉼표로 다중 지정 가능 (예: `--only permissions,release`). |
| `--force` | 파괴적 스키마 변경 허용. 없으면 destructive DDL은 차단된다. |
| `--no-schema-apply` | plan/검증만 수행. DB 변경 없이 릴리즈는 차단된다. |
| `--dry-run` | Hub에 반영하지 않고 plan/검증 결과만 출력. |
| `--json` | 기계가 파싱하기 쉬운 출력 (`releaseId`, `ref`, 단계별 결과 등). |

### 멱등성

- Hub는 apply를 멱등으로 처리한다.
- 동일한 입력 (`project/env/ref` + 스냅샷 내용)이면 같은 `releaseId`를 반환한다.
- 스냅샷 내용이 달라지면 새로운 `releaseId`를 생성한다.

### Multi-Connection

- `release` 단계 (releaseId 생성/확정)는 "프로젝트 스냅샷 전체"를 대상으로 한다. 테이블 일부만 대상으로 한 release는 만들지 않는다.

---

## 4) Error Behavior

- repo context가 없고 `--project/--env`도 없으면: 에러로 종료 (명시적으로 설정하도록 유도).
- repo context에 `hubUrl`이 없고 `--hub`도 없으면: 에러로 종료.

---

## 5) CI Guidance

- repo context에 의존하지 않는다.
- 모든 `stk` 명령에 `--project/--env`를 명시한다.
- `--ref`는 항상 현재 커밋 SHA로 고정해 재현성을 보장한다.

---

## 6) Command Index

이 문서는 `context/apply`의 핵심 동작을 정의한다. 하위 커맨드의 세부 동작은 각 capability 문서에서 확정한다.

| Command group | 최소 커맨드 | Capability |
|---------------|------------|------------|
| auth | `stk login`, `stk whoami` | AUTH-001 |
| bootstrap | `stk project create`, `stk env create` | OPERATOR-001 |
| connections | `stk connections set/test/list/show` | OPERATOR-001 |
| apikey | `stk apikey create/list/revoke` | OPERATOR-002 |
| apply (schema) | `stk apply --only schema [--dry-run] [--force]` | OPERATOR-003 |
| apply (permissions) | `stk apply --only permissions` | OPERATOR-004 |
| release | `stk release current/list/show/promote/rollback` | OPERATOR-005 |
| rbac | `stk org/project invite/members/remove` | OPERATOR-006 |
