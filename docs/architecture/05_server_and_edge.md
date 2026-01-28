# 05. Server & Edge 명세 (브리지)

## 역할
"데이터 플레인(Data Plane)". 사용자 가까이에서 로직을 실행합니다.

## 아키텍처: TypeScript 런타임
*   **플랫폼**: Cloudflare Workers (또는 호환되는 Edge 런타임).
*   **핵심 로직**: **TypeScript**로 작성되어 Cloudflare Workers에서 네이티브로 실행됩니다.
    *   이유: Cloudflare Workers의 First-class 언어인 JavaScript/TypeScript 생태계를 100% 활용하고, 디버깅 용이성을 확보하기 위함입니다.
*   **구조**: 경량화된 라우터와 실행 엔진이 순수 JavaScript/TypeScript로 구현되어 있습니다.
*   **정책 (Policy)**: "Zero Dependency". 사용자 로직은 외부 npm 의존성을 가질 수 없으며, 플랫폼이 제공하는 Standard API와 내부 파일 import만 허용됩니다.

## 런타임 흐름

1.  **요청**: 클라이언트로부터 `POST /call` 요청이 들어옵니다.
2.  **컨텍스트 로드 (제로 레이턴시)**:
    *   서버는 로컬 메모리 캐시에서 프로젝트 설정을 확인합니다.
    *   없으면 **Edge KV**(`project:{id}:latest`)에서 읽습니다.
    *   *참고: Hub를 호출하지 않습니다.*
3.  **비밀 정보 수화(Hydration)**:
    *   설정에는 암호화된 비밀 정보(DB URL, API 키)가 포함되어 있습니다.
    *   서버는 환경 변수(마스터 키)를 사용하여 메모리 내에서 이를 복호화합니다.
4.  **보안 확인**:
    *   세션 / JWT 검증을 수행합니다 (`auth.yaml`의 규칙 사용).
5.  **실행**:
    *   라우터가 로직 함수를 찾습니다 (예: `users/get.sql`).
    *   **SQL 로직**: **연결 프록시** (예: Hyperdrive)를 사용하여 DB에 쿼리를 실행합니다.
    *   **JS 로직**: 사용자가 작성한 TS 코드를 실행합니다. (외부 라이브러리 없는 순수 연산/조합 로직)
6.  **응답**: JSON을 클라이언트에 반환합니다.

## 주요 기술
*   **Edge KV**: "글로벌 공유 상태". 로직 코드와 설정을 저장합니다.
*   **연결 풀링 (Hyperdrive)**: Edge에 필수적입니다. 데이터베이스의 웜(warm) TCP 연결을 유지하여 핸드셰이크 지연과 연결 고갈을 방지합니다.
*   **TypeScript 엔진**: 복잡한 컴파일 과정 없이 순수 JS 런타임 위에서 동작하여 가볍고 빠릅니다.

## 로컬 런타임 (stk dev)
*   이 정확한 동작을 모방하지만 로컬 Node.js/Bun 서버로 실행됩니다.
*   KV 대신 디스크의 `logic/`을 직접 읽습니다.
*   Hyperdrive 대신 로컬 Docker DB를 사용합니다.
