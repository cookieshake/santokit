---
id: MCP-004
domain: mcp
title: Release tool — get current release info
status: planned
depends: [MCP-001]
spec_refs: ["plan/spec/mcp.md", "plan/spec/operator.md"]
test_refs: []
code_refs: []
---

## Intent

AI 도구가 현재 `project/env`에 배포된 릴리즈의 식별 정보를 조회할 수 있도록 `release_current` tool을 제공한다. AI가 코드 생성이나 디버깅 지원 중 현재 배포 상태를 기준 삼아야 할 때, 어떤 릴리즈를 기준으로 응답이 생성되었는지 명확히 알 수 있게 한다.

## Execution Semantics

- `release_current` tool은 파라미터 없이 호출한다. MCP-001이 확립한 현재 CLI 컨텍스트(`project`, `env`)에 대해 Hub가 관리하는 현재 릴리즈 포인터를 조회하여 반환한다.
- 응답에는 `releaseId`, `project`, `env` 세 필드가 포함된다. 이 값들은 Hub의 릴리즈 레코드에서 직접 읽는다.
- 민감 정보(DB 연결 문자열, API 키 등)는 응답에 포함되지 않는다. `releaseId`는 식별자이므로 노출 허용 대상이다.
- 현재 컨텍스트의 `env`에 대한 릴리즈 포인터가 Hub에 존재하지 않으면 릴리즈 없음 오류를 반환한다.

## Observable Outcome

- `release_current` 호출 시 Hub에 저장된 현재 릴리즈 포인터와 일치하는 `releaseId`, `project`, `env` 값이 반환된다.
- `stk apply` 또는 `stk release promote` 이후 릴리즈 포인터가 변경된 상태에서 호출하면 변경된 포인터가 반환된다.
- 릴리즈가 없는 env에서 호출하면 오류가 반환된다.

## Usage

`release_current` 호출 예시 (파라미터 없음):

```json
{}
```

응답 예시:

```json
{ "releaseId": "rel_01H...", "project": "myapp", "env": "prod" }
```

## Acceptance Criteria

- [ ] `release_current` 호출 시 현재 CLI 컨텍스트의 `project`와 `env` 값이 응답에 포함된다.
- [ ] 응답의 `releaseId`가 Hub에 저장된 현재 릴리즈 포인터와 일치한다.
- [ ] `stk apply` 실행 후 새 릴리즈가 발급된 상태에서 호출하면 갱신된 `releaseId`가 반환된다.
- [ ] 응답에 DB 연결 문자열, API 키, 토큰 등 민감 정보가 포함되지 않는다.
- [ ] 현재 env에 릴리즈가 없는 경우 오류 응답이 반환된다.

## Failure Modes

- 현재 `env`에 대한 릴리즈가 Hub에 존재하지 않는 경우: 릴리즈 없음 오류 코드로 응답한다. 이는 `stk apply`가 한 번도 성공하지 않은 env이거나, 릴리즈가 삭제된 경우에 해당한다.
