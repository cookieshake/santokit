# 06. Client SDK 명세

## 역할
"인터페이스". 백엔드 API에 대해 타입이 지정된 함수형 경험을 제공합니다.

## 철학
**"최소한의 코드 생성 (Minimal Code Generation)."**
사용자의 `src/` 폴더를 복잡한 API 모델 파일로 어지럽히지 않고, 단 하나의 선언 파일 (`santokit-env.d.ts`)만으로 타입을 관리합니다.

## 구성 요소

### 1. 프록시 (`@santokit/client`)
런타임에 클라이언트는 경량 프록시 래퍼입니다.

```javascript
import { stk } from '@santokit/client';

// 사용자가 호출하는 코드:
const user = await stk.logic.users.get({ id: 123 });

// 프록시가 변환하는 내용:
// POST https://device-edge.santokit.run/call
// Body: { path: "users/get", params: { id: 123 } }
```

### 2. 모듈 보강 (Module Augmentation)
*   **트리거**: `stk sync`.
*   **메커니즘**:
    1.  Hub에서 `manifest.json`을 다운로드합니다 (모든 로직에 대한 입력, 출력, 설명 포함).
    2.  `santokit-env.d.ts` 파일을 생성하여 `@santokit/client` 모듈의 타입을 확장(Augment)합니다.
    3.  생성 위치는 `stk.config.json`에서 설정 가능합니다 (기본값: 프로젝트 루트).
*   **결과**: 표준 TypeScript 기능을 활용한 안전하고 강력한 IntelliSense.

## SDK 네임스페이스

### `stk.auth` (Interface)
*   **역할**: 인증 제공자에 대한 추상화된 인터페이스입니다. Google, GitHub, 또는 커스텀 OIDC와 연결될 수 있습니다.
*   `login(provider)`: OAuth 흐름을 시작합니다.
*   `logout()`: 토큰을 지웁니다.
*   `me()`: 현재 세션 정보를 반환합니다.
*   `getToken()`: 헤더 첨부 등을 위한 내부용 함수입니다.

### `stk.logic`
*   `logic/` 폴더 구조와 일치하는 동적 네임스페이스입니다.
*   **파일 처리**: 별도의 `stk.files` 네임스페이스는 존재하지 않습니다. 파일 업로드/다운로드는 사용자가 작성한 로직(예: `stk.logic.uploads.getPresignedUrl()`)을 통해 처리합니다.
*   YAML 정의 / SQL 분석을 기반으로 입력과 출력이 완전히 타이핑됩니다.
*   `logic/` 폴더 구조와 일치하는 동적 네임스페이스입니다.
*   YAML 정의 / SQL 분석을 기반으로 입력과 출력이 완전히 타이핑됩니다.

## SSR/Edge 호환성
*   SDK는 동형(isomorphic)이어야 합니다 (Node.js와 브라우저 모두에서 작동).
*   Next.js App Router (서버 컴포넌트)의 경우, 인증 컨텍스트를 전파하기 위해 fetch 헤더를 올바르게 처리합니다.
