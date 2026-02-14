---
id: SDK-002
domain: sdk
title: Type mapping from schema to TypeScript
status: planned
depends: [SDK-001]
spec_refs: ["plan/spec/schema.md"]
test_refs: []
code_refs: []
---

## Intent

스키마 IR의 모든 타입이 TypeScript 타입으로 결정론적으로 변환되어야 한다. 개발자가 생성된 코드에서 타입을 신뢰하고 사용할 수 있도록, 타입 매핑 규칙과 JSON 직렬화 규칙을 명확히 정의한다.

## Execution Semantics

- SDK-001의 코드 생성 단계에서 스키마 IR의 각 컬럼 타입을 아래 매핑 테이블에 따라 TypeScript 타입 문자열로 변환한다.
- `nullable: true`인 컬럼은 변환된 타입에 `| null` 유니온을 추가한다.
- `array<T>` 타입은 원소 타입 `T`에 대해 동일한 매핑을 재귀 적용한 뒤 `T[]`로 표현한다.
- JSON wire format 직렬화는 아래 직렬화 규칙에 따라 Bridge `/call`로 전송/수신된다.

### 타입 매핑 테이블

| 스키마 타입 | TypeScript 타입 | 비고 |
|------------|----------------|------|
| `string` | `string` | |
| `int` | `number` | |
| `bigint` | `string` | 정밀도 보존을 위해 문자열 사용 |
| `float` | `number` | |
| `decimal` | `string` | 정밀도 보존을 위해 number 금지 |
| `boolean` | `boolean` | |
| `json` | `unknown` | 구조 불명확 |
| `timestamp` | `string` | RFC3339 형식 |
| `bytes` | `string` | RFC4648 base64(줄바꿈 없음) |
| `file` | `string` | storage key (직접 URL 아님) |
| `array<T>` | `T[]` | 원소 타입 재귀 매핑 |

### 직렬화 규칙

- `timestamp`: RFC3339 문자열로 전송한다. 런타임 Date 파싱은 사용자의 책임이다.
- `bigint`: JSON wire format을 문자열로 전송·수신한다. JavaScript의 `number` 타입은 64비트 정수를 정확히 표현할 수 없으므로 `string`으로 보존한다.
- `decimal`: 부동소수점 오차를 피하기 위해 문자열로 전송한다. `number` 타입 매핑은 허용하지 않는다.
- `bytes`: RFC4648 base64 문자열(줄바꿈 없음)로 전송한다. SDK는 필요 시 디코드 유틸리티를 제공할 수 있다.
- `file`: storage key 문자열로 전송한다. 실제 다운로드/업로드는 Storage API의 서명 발급을 통해 수행한다.

## Observable Outcome

- 생성된 TypeScript 파일에서 각 컬럼의 타입이 매핑 테이블과 일치한다.
- `nullable: true`인 컬럼은 `T | null` 유니온 타입으로 생성된다.
- `array<T>` 타입 컬럼은 `T[]`로 생성된다.

## Usage

스키마 IR 예시:

```yaml
columns:
  id:       { type: bigint }
  score:    { type: decimal }
  tags:     { type: "array<string>" }
  memo:     { type: string, nullable: true }
  snapshot: { type: timestamp }
```

생성된 TypeScript 타입:

```typescript
export interface Item {
  id: string;          // bigint → string
  score: string;       // decimal → string
  tags: string[];      // array<string> → string[]
  memo: string | null; // nullable → T | null
  snapshot: string;    // timestamp → string (RFC3339)
}
```

## Acceptance Criteria

- [ ] 매핑 테이블의 모든 스키마 타입이 지정된 TypeScript 타입으로 생성된다.
- [ ] `nullable: true` 컬럼은 `T | null` 유니온 타입으로 생성된다.
- [ ] `array<T>` 컬럼은 원소 타입을 재귀 매핑하여 `T[]`로 생성된다.
- [ ] `bigint`와 `decimal` 컬럼은 `string`으로 생성되며 `number`로 생성되지 않는다.
- [ ] `timestamp` 컬럼은 `string`으로 생성된다.

## Failure Modes

- 스키마 IR에 매핑 테이블에 없는 알 수 없는 타입이 포함된 경우: 코드 생성이 중단되고 CLI는 non-zero로 종료하며 문제가 된 타입과 컬럼명을 오류 메시지에 포함한다.
