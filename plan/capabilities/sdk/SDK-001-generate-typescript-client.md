---
id: SDK-001
domain: sdk
title: Generate TypeScript client from release schema
status: planned
depends: [OPERATOR-001, OPERATOR-003]
spec_refs: ["plan/spec/schema.md", "plan/spec/cli.md"]
test_refs: []
code_refs: []
---

## Intent

개발자가 매번 수동으로 API 타입을 정의하는 반복 작업을 제거하기 위해, Hub의 현재 릴리즈 메타데이터(스키마 IR)로부터 타입 안전한 TypeScript 클라이언트를 자동 생성한다. 생성된 파일 하나만으로 테이블 타입, CRUD 메서드 시그니처, 클라이언트 진입점이 모두 갖춰진다.

## Execution Semantics

- `stk gen client --lang typescript --output <path> [--env <env>]`를 실행하면 CLI는 Hub API를 호출하여 해당 env의 현재 릴리즈를 가져온다.
- Hub가 릴리즈 레코드를 반환하면 CLI는 릴리즈에 포함된 스키마 IR(테이블·컬럼·타입·nullable 정보)을 추출한다.
- CLI는 스키마 IR을 TypeScript 템플릿에 적용하여 단일 `.ts` 파일을 렌더링한다.
- 렌더링된 파일을 `--output`으로 지정한 경로에 기록한다. 상위 디렉토리가 없으면 자동 생성한다.
- 생성 파일 상단에는 `releaseId`와 `generatedBy`(stk 버전) 메타데이터를 주석 또는 상수로 포함한다.
- `--env`를 생략하면 현재 CLI 컨텍스트의 env를 사용한다.

## Observable Outcome

- `--output`으로 지정한 경로에 TypeScript 파일이 생성된다.
- 파일 안에는 스키마 IR의 각 테이블에 대응하는 Row 타입 인터페이스, Insert 타입 인터페이스, 테이블 클래스, 그리고 `client.db.<table>` 형태의 진입점이 포함된다.
- 파일 상단에 `releaseId`와 `generatedBy` 메타데이터가 명시된다.
- CLI는 성공 시 exit 0을 반환한다.

## Usage

```
stk gen client --lang typescript --output ./src/generated/client.ts --env dev
```

## Acceptance Criteria

- [ ] `stk gen client --lang typescript --output <path> --env <env>` 실행 후 지정 경로에 `.ts` 파일이 생성된다.
- [ ] 생성된 파일의 인터페이스 및 타입이 해당 릴리즈 스키마 IR과 일치한다.
- [ ] 생성 파일 상단에 `releaseId`와 `generatedBy` 메타데이터가 포함된다.
- [ ] 성공 시 CLI exit code가 0이다.
- [ ] 해당 env에 현재 릴리즈가 없으면 CLI가 non-zero exit code로 종료되고 오류 메시지를 출력한다.

## Failure Modes

- 해당 env에 현재 릴리즈가 없는 경우: Hub가 404를 반환하고 CLI는 non-zero로 종료한다.
- Hub에 접근할 수 없는 경우(네트워크 오류 또는 인증 실패): CLI는 non-zero로 종료하고 원인 메시지를 출력한다.
- `--output` 경로에 쓰기 권한이 없는 경우: 파일 기록 단계에서 오류가 발생하고 CLI는 non-zero로 종료한다.
