# SDK Capability Guide

이 도메인은 Santokit 스키마 IR로부터 타입 안전한 클라이언트 SDK를 자동 생성하는 흐름 전체를 다룬다.
SDK 생성은 CLI가 Hub(제어-평면)의 릴리즈 메타데이터를 읽어 코드를 만들고,
생성된 SDK의 런타임 호출은 Bridge(데이터-평면) `POST /call`을 직접 대상으로 한다.

## 흐름 및 의존 관계

**OPERATOR-001 → OPERATOR-003 → SDK-001 → SDK-002/003/004/005** 순서가 핵심 선행 관계다.
Hub에 유효한 릴리즈가 없으면 SDK를 생성할 수 없고, SDK가 없으면 나머지 capability가 의미를 갖지 않는다.

---

### 1단계 — SDK 생성: `SDK-001`

`stk gen client --lang typescript --output <path> --env <env>`를 실행하면 CLI는
Hub API에서 해당 env의 현재 릴리즈를 가져온다. 릴리즈에 포함된 스키마 IR(테이블·컬럼·타입 정보)을
추출하여 단일 TypeScript 파일로 렌더링한 뒤 지정 경로에 기록한다.

이 파일 하나에 테이블 타입 인터페이스, CRUD 메서드, 클라이언트 진입점이 모두 포함된다.
생성 파일 상단에는 `releaseId`와 `generatedBy` 메타데이터가 명시되어 디버깅 시 추적 가능하다.

Hub의 릴리즈 메타데이터를 소비하는 것은 **생성 시점**뿐이다.
이후 실제 데이터 요청은 Hub가 아닌 Bridge `POST /call`로 전송된다.

- [`SDK-001`](SDK-001-generate-typescript-client.md) — CLI로 TypeScript 클라이언트 파일 생성

---

### 2단계 — 타입 안전성과 API 형태: `SDK-002`, `SDK-003`

SDK-001이 만든 파일의 품질은 타입 매핑과 API 형태의 정확성에 달려 있다.
두 capability는 SDK-001에 병렬로 의존하며 각각 독립된 관심사를 다룬다.

**SDK-002 — 타입 매핑**

스키마 IR의 모든 타입을 TypeScript 타입으로 변환하는 규칙을 정의한다.
`bigint`와 `decimal`은 정밀도 보존을 위해 `string`으로 매핑된다.
`timestamp`는 RFC3339 문자열, `bytes`는 base64 문자열로 직렬화된다.
`nullable: true`인 컬럼은 `T | null` 유니온, `array<T>`는 `T[]`로 생성된다.

스키마 IR이 타입 안전성의 유일한 근거다. SDK는 런타임에 타입을 추론하거나 추측하지 않는다.

- [`SDK-002`](SDK-002-type-mapping.md) — 스키마 타입 → TypeScript 타입 매핑 및 직렬화 규칙

**SDK-003 — CRUD API 형태**

생성된 클라이언트의 `client.db.<table>.select/insert/update/delete` 메서드 시그니처를 정의한다.
메서드 파라미터 타입은 `plan/spec/crud.md`의 `/call` params 구조를 그대로 반영한다.
MVP에서는 체이닝 기반 query builder 없이 직접 파라미터 객체를 전달하는 형태로 유지한다.
스키마에 없는 테이블은 `client.db` 타입에 존재하지 않으므로 컴파일 타임에 오류가 감지된다.

- [`SDK-003`](SDK-003-crud-api-shape.md) — CRUD 메서드 시그니처 및 파라미터 타입

---

### 3단계 — 런타임 안전성: `SDK-004`, `SDK-005`

생성된 SDK를 실제 환경에서 안정적으로 사용하려면 오류 처리와 인증이 명확해야 한다.
두 capability는 SDK-001에 병렬로 의존하며 런타임 계층을 완성한다.

**SDK-004 — 에러 처리**

Bridge에서 non-200 응답이 반환되면 SDK는 `SantokitError(code, message, requestId)`를 throw한다.
`code`는 서버 오류 코드를 그대로 전달하며, `requestId`는 디버깅 추적에 활용된다.
네트워크 오류(연결 거부, 타임아웃)는 `SantokitError`로 래핑되지 않고 원래 오류 타입으로 전파된다.

**클라이언트 측 권한 재현은 하지 않는다.** permissions(roles/columns/CEL)의 허용·거부 판단은
Bridge 런타임이 최종적으로 수행한다. SDK는 403 응답을 받으면 단순히 `SantokitError`를 throw할 뿐,
컬럼 숨김이나 역할 검사 같은 로직을 클라이언트에서 구현하지 않는다.

- [`SDK-004`](SDK-004-error-handling.md) — SantokitError 타입, non-200 처리, 권한 미재현 원칙

**SDK-005 — 인증 통합**

클라이언트 생성자는 `apiKey`(서버/CI용) 또는 `accessToken`(엔드 유저용) 중 하나를 받는다.
`apiKey`는 `X-Santokit-Api-Key` 헤더로, `accessToken`은 `Authorization: Bearer` 헤더로
모든 Bridge 요청에 자동 주입된다. 둘 다 제공하거나 둘 다 없으면 즉시 오류가 발생한다.
MVP에서 access token 자동 갱신은 지원하지 않는다.

- [`SDK-005`](SDK-005-auth-integration.md) — API key / access token 헤더 주입, 상호 배타 검증

---

## 핵심 설계 원칙

### CLI 생성 vs 런타임 호출 분리

SDK 생성(`stk gen client`)은 **Hub(제어-평면)**의 릴리즈 메타데이터를 한 번 소비한다.
생성된 SDK의 **런타임 호출**은 **Bridge(데이터-평면)** `POST /call`을 대상으로 한다.
두 경로는 엄격히 분리된다. 생성된 파일은 Hub를 직접 호출하는 코드를 포함하지 않는다.

### 스키마 IR이 타입 안전성의 근거

생성 시점의 릴리즈 스키마 IR이 타입과 경로를 고정한다.
스키마가 변경된 후에는 해당 env 기준으로 SDK를 재생성하는 것이 기본 운영 방식이다.
런타임에 서버 릴리즈와의 자동 불일치 감지는 MVP에서 제공하지 않는다.

### 클라이언트 측 권한 재현 없음

SDK는 permissions를 클라이언트에서 재현하지 않는다.
허용·거부의 최종 판단은 항상 Bridge 런타임이 수행한다.
SDK가 클라이언트에서 권한 로직을 구현하면 실제 서버 정책과 불일치가 생길 수 있으므로 의도적으로 배제한다.

---

## 컴포넌트 경계 요약

| Capability | CLI(stk) | Hub(control-plane) | Bridge(data-plane) |
|---|---|---|---|
| SDK-001 | gen client 명령 진입 | 릴리즈 메타데이터 제공 | — |
| SDK-002 | 타입 매핑 코드 생성 | — | JSON 직렬화 표준 수신 |
| SDK-003 | CRUD 메서드 코드 생성 | — | POST /call 수신 |
| SDK-004 | — | — | non-200 응답 전달 |
| SDK-005 | — | — | 인증 헤더 수신·검증 |
