---
id: SDK-005
domain: sdk
title: Auth integration in generated SDK
status: planned
depends: [SDK-001]
spec_refs: ["plan/spec/client-sdk.md", "plan/spec/auth.md"]
test_refs: []
code_refs: []
---

## Intent

생성된 SDK가 서버/CI 환경에서는 API key를, 엔드 유저 컨텍스트에서는 access token을 Bridge에 전달할 수 있어야 한다. 클라이언트는 생성 시 하나의 인증 수단만 설정하며, SDK는 모든 Bridge 요청에 올바른 헤더를 자동으로 주입한다.

## Execution Semantics

- 클라이언트 생성자(`constructor`)는 `config` 객체에서 `apiKey` 또는 `accessToken` 중 하나를 받는다.
- `apiKey`가 설정된 경우: 모든 Bridge `POST /call` 요청에 `X-Santokit-Api-Key: <apiKey>` 헤더를 추가한다.
- `accessToken`이 설정된 경우: 모든 Bridge `POST /call` 요청에 `Authorization: Bearer <accessToken>` 헤더를 추가한다.
- 두 인증 수단은 `config` 객체 레벨에서 상호 배타적으로 처리한다. 둘 다 제공되거나 둘 다 없으면 생성자 또는 첫 요청 시 오류를 발생시킨다.
- MVP에서 access token 만료 자동 감지 및 갱신은 지원하지 않는다. 토큰 갱신은 호출자의 책임이다.
- 헤더 주입은 SDK 내부적으로 처리되며 호출자가 직접 헤더를 설정할 필요가 없다.

## Observable Outcome

- `apiKey`로 생성된 클라이언트의 모든 요청에 `X-Santokit-Api-Key` 헤더가 포함된다.
- `accessToken`으로 생성된 클라이언트의 모든 요청에 `Authorization: Bearer` 헤더가 포함된다.
- 인증 수단 미설정 또는 중복 설정 시 SDK가 오류를 발생시킨다.

## Usage

```typescript
// 서버/CI 환경: API key 사용
const serverClient = new MyAppClient({
  bridgeUrl: 'https://bridge.example.com',
  apiKey: 'stk_key_...',
});

// 엔드 유저 컨텍스트: access token 사용
const userClient = new MyAppClient({
  bridgeUrl: 'https://bridge.example.com',
  accessToken: 'stk_at_...',
});

// 잘못된 사용: 둘 다 제공 → 오류
const invalid = new MyAppClient({
  bridgeUrl: 'https://bridge.example.com',
  apiKey: 'stk_key_...',
  accessToken: 'stk_at_...',  // 오류 발생
});

// 잘못된 사용: 둘 다 없음 → 오류
const noAuth = new MyAppClient({
  bridgeUrl: 'https://bridge.example.com',
  // apiKey와 accessToken 모두 없음 → 오류 발생
});
```

### 헤더 주입 동작

| 설정 | 전송 헤더 |
|------|-----------|
| `apiKey: 'stk_key_...'` | `X-Santokit-Api-Key: stk_key_...` |
| `accessToken: 'stk_at_...'` | `Authorization: Bearer stk_at_...` |

## Acceptance Criteria

- [ ] `apiKey`를 설정한 클라이언트의 모든 Bridge 요청에 `X-Santokit-Api-Key` 헤더가 포함된다.
- [ ] `accessToken`을 설정한 클라이언트의 모든 Bridge 요청에 `Authorization: Bearer <token>` 헤더가 포함된다.
- [ ] `apiKey`와 `accessToken`을 동시에 제공하면 SDK가 오류를 발생시킨다.
- [ ] `apiKey`와 `accessToken` 모두 제공하지 않으면 SDK가 오류를 발생시킨다.
- [ ] MVP에서 access token 자동 갱신 로직이 포함되지 않는다.

## Failure Modes

- `apiKey`와 `accessToken`이 동시에 제공된 경우: 생성자에서 즉시 오류를 throw한다. 요청이 전송되지 않는다.
- `apiKey`와 `accessToken` 모두 제공되지 않은 경우: 생성자 또는 첫 요청 시 오류를 throw한다.
- access token 만료: Bridge가 401을 반환하고 SDK는 `SantokitError(code: 'UNAUTHORIZED')`를 throw한다. 토큰 갱신은 호출자가 새 `accessToken`으로 클라이언트를 재생성하여 처리해야 한다.
