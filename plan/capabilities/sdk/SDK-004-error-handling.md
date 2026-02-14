---
id: SDK-004
domain: sdk
title: Error handling in generated SDK
status: planned
depends: [SDK-001]
spec_refs: ["plan/spec/errors.md"]
test_refs: []
code_refs: []
---

## Intent

생성된 SDK의 모든 Bridge 호출이 실패할 경우 호출자가 오류 원인을 구조적으로 식별할 수 있어야 한다. SDK는 서버 오류 응답을 `SantokitError` 타입으로 표준화하여 throw한다. 클라이언트 측에서 권한 정책을 재현하지 않으며, 허용·거부의 최종 판단은 Bridge 런타임이 담당한다.

## Execution Semantics

- Bridge `POST /call`에서 HTTP 200 이외의 응답이 반환되면 SDK는 응답 바디를 파싱하여 `SantokitError`를 생성하고 throw한다.
- `SantokitError`는 `code`, `message`, `requestId` 필드를 포함한다.
- `code`는 서버가 반환한 오류 코드 문자열(`BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `INTERNAL_ERROR` 등)을 그대로 전달한다.
- `requestId`는 서버 응답 바디 또는 응답 헤더에서 추출하여 디버깅 추적에 활용한다.
- 네트워크 수준 오류(연결 거부, 타임아웃 등)는 `SantokitError`와 구별되는 별도의 오류로 전파되며 SDK가 래핑하지 않는다.
- SDK는 permissions(roles/columns/CEL)을 클라이언트에서 재현하지 않는다. 403 응답은 Bridge의 런타임 판단 결과이며 SDK는 이를 그대로 throw한다.

### 오류 인터페이스

```typescript
export interface SantokitError {
  code: string;      // 'BAD_REQUEST' | 'UNAUTHORIZED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INTERNAL_ERROR'
  message: string;
  requestId: string;
}
```

## Observable Outcome

- Bridge에서 HTTP non-200 응답이 오면 SDK 메서드가 `SantokitError`를 throw한다.
- `error.code`가 서버 응답의 오류 코드와 일치한다.
- `error.requestId`가 서버 추적 ID로 채워진다.
- 네트워크 오류는 `SantokitError`로 래핑되지 않고 원래 오류 타입으로 전파된다.

## Usage

```typescript
import { MyAppClient, SantokitError } from './generated/client';

const client = new MyAppClient({
  bridgeUrl: 'https://bridge.example.com',
  apiKey: 'stk_key_...',
});

try {
  const users = await client.db.users.select({ where: { id: '999' } });
} catch (err) {
  if (err instanceof SantokitError) {
    console.error(`[${err.code}] ${err.message} (requestId: ${err.requestId})`);
    // 예: [FORBIDDEN] You do not have permission to access this resource. (requestId: req_xyz)
    // 예: [NOT_FOUND] Resource not found. (requestId: req_abc)
  } else {
    // 네트워크 오류 등 SantokitError가 아닌 오류
    throw err;
  }
}
```

## Acceptance Criteria

- [ ] Bridge로부터 non-200 응답이 반환되면 SDK 메서드가 `SantokitError`를 throw한다.
- [ ] `error.code`가 서버 응답 바디의 오류 코드와 일치한다.
- [ ] `error.requestId`가 서버 응답에서 추출한 요청 추적 ID로 채워진다.
- [ ] 네트워크 오류(연결 실패, 타임아웃)는 `SantokitError`로 래핑되지 않는다.
- [ ] SDK는 클라이언트 측에서 권한(403) 판단을 시도하지 않는다.

## Failure Modes

- 네트워크 오류(연결 거부, 타임아웃): SDK는 이를 `SantokitError`로 래핑하지 않고 원래 오류(예: `TypeError`, `NetworkError`)로 전파한다. 호출자는 `err instanceof SantokitError` 분기와 별도로 이를 처리해야 한다.
- 서버 오류 응답 바디가 예상 형식이 아닌 경우: SDK는 `code: 'INTERNAL_ERROR'`, `message`에 원시 응답 텍스트를 담아 `SantokitError`를 throw한다. `requestId`는 헤더에서 추출을 시도하고 없으면 빈 문자열로 처리한다.
