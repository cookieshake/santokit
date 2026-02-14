---
id: MCP-001
domain: mcp
title: Start MCP server in stdio and SSE modes
status: planned
depends: [OPERATOR-001]
spec_refs: ["plan/spec/mcp.md", "plan/spec/cli.md"]
test_refs: []
code_refs: []
---

## Intent

AI 도구(VS Code, Cursor 등의 에디터 또는 웹 기반 LLM 클라이언트)가 Santokit 프로젝트의 컨텍스트 정보에 접근할 수 있도록 MCP(Model Context Protocol) 서버를 두 가지 전송 모드로 기동한다. stdio 모드는 에디터 내장 MCP 클라이언트 연동에, SSE 모드는 HTTP 기반 연동에 사용한다.

## Execution Semantics

- `stk mcp run`은 stdio 모드로 MCP 서버를 기동한다. 표준 입력(stdin)으로 MCP JSON-RPC 요청을 수신하고 표준 출력(stdout)으로 응답을 반환한다. VS Code, Cursor 등 에디터가 subprocess로 MCP 클라이언트를 실행할 때 이 모드를 사용한다.
- `stk mcp start [--port <port>]`는 SSE 모드로 HTTP 서버를 기동한다. 기본 포트는 spec에서 정의한 값을 따른다. MCP 클라이언트는 `http://localhost:<port>/sse`로 연결한다.
- 두 모드 모두 현재 CLI 컨텍스트(`project`, `env`)를 읽어 서버 범위를 결정한다. 서버 기동 시점에 컨텍스트가 고정되며, MCP 세션 중에는 `project/env` 전환을 지원하지 않는다(MVP 결정).
- 컨텍스트를 변경하려면 `stk context set ...`으로 컨텍스트를 교체한 뒤 MCP 서버를 재시작해야 한다.
- 서버 기동 직후 Hub 연결 가능 여부와 현재 컨텍스트의 릴리즈 존재 여부를 확인한다. 확인에 실패하면 서버를 기동하지 않고 non-zero exit code와 함께 오류를 출력한다.

## Observable Outcome

- `stk mcp run` 실행 시 MCP 서버가 stdio 전송 모드로 대기 상태가 된다. MCP JSON-RPC 요청을 stdin으로 수신하면 tool 호출 결과를 stdout으로 반환한다.
- `stk mcp start [--port <port>]` 실행 시 HTTP 서버가 지정 포트에 바인딩되어 `GET /sse` 엔드포인트가 SSE 연결을 수락한다.
- 두 모드 모두 현재 CLI 컨텍스트의 `project`/`env` 범위 안에서만 tool 결과를 반환한다.

## Usage

```sh
# stdio 모드 — VS Code / Cursor 에디터 통합
stk mcp run

# SSE 모드 — 기본 포트로 기동
stk mcp start

# SSE 모드 — 포트 지정
stk mcp start --port 8080
```

MCP 클라이언트(SSE 모드)는 다음 엔드포인트로 연결한다:

```
GET http://localhost:8080/sse
```

## Acceptance Criteria

- [ ] `stk mcp run` 실행 시 프로세스가 종료되지 않고 stdin 대기 상태를 유지하며, MCP JSON-RPC 요청을 stdin으로 전송하면 유효한 JSON-RPC 응답이 stdout으로 반환된다.
- [ ] `stk mcp start` 실행 시 HTTP 서버가 기본 포트에서 기동되고 `GET /sse`가 SSE 연결 요청을 수락한다.
- [ ] `stk mcp start --port 8080` 실행 시 포트 8080에서 서버가 기동된다.
- [ ] 두 모드 모두 현재 CLI 컨텍스트(`project`, `env`)를 사용하며, 기동 시점 이후 세션 내 컨텍스트 전환은 반영되지 않는다.
- [ ] 컨텍스트를 교체한 뒤 서버를 재시작하면 새 컨텍스트가 적용된 tool 응답이 반환된다.

## Failure Modes

- 현재 CLI 컨텍스트에 `project` 또는 `env`가 설정되지 않은 경우: 서버 기동에 실패하고 non-zero exit code와 함께 "context not set" 오류 메시지를 출력한다.
- Hub에 도달할 수 없는 경우: 서버 기동에 실패하고 non-zero exit code와 함께 Hub 연결 실패 오류를 출력한다.
- SSE 모드에서 지정 포트가 이미 사용 중인 경우: 서버 기동에 실패하고 non-zero exit code와 함께 "port already in use" 오류 메시지를 출력한다.
