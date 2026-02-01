# 01. Santokit 아키텍처 개요

## 핵심 철학
**"단순함, 빠름, 관리됨, 그리고 개방성."**
Santokit (stk)는 백엔드 인프라의 복잡성을 추상화하여 개발자가 비즈니스 로직과 데이터 스키마에만 집중할 수 있도록 설계되었습니다. 엣지 컴퓨팅(Edge Computing)을 활용하여 지연 없는(zero-latency) 실행을 보장하며, "No-Code-Gen" 접근 방식으로 매끄러운 개발 경험을 제공합니다. 또한 개방형 생태계를 지향하여 외부 Provider와의 유연한 연동을 지원하고, 셀프 호스팅의 자유를 보장합니다.

## 4가지 핵심 구성 요소

### 1. CLI (`stk`)
*   **위치**: 개발자의 로컬 머신.
*   **역할**: "손과 발". 파일을 파싱하고, Hub와 통신합니다.
*   **주요 책임**:
    *   `schema/`(스키마), `config/`(설정), `logic/` 디렉토리 스캔 및 파싱.
    *   로직 및 스키마 변경 사항을 Hub로 반영.
    *   **동기화(Sync)**: Hub의 최신 매니페스트를 로컬로 동기화하고 타입 정의 파일 생성.

### 2. Hub (`Santokit-Hub`)
*   **위치**: 중앙 관리 서버 (Go 기반).
*   **역할**: "뇌" 및 "제어 플레인(Control Plane)".
*   **주요 책임**:
    *   **레지스트리**: 로직(SQL/JS/WASM) 및 스키마 계획의 버전을 저장.
    *   **볼트(Vault)**: 비밀 정보(DB 자격 증명, API 키)를 안전하게 암호화하여 저장.
    *   **스키마 엔진**: Atlas를 사용하여 DB 스키마를 안전하게 관리하고 마이그레이션.
    *   **프로비저너**: 서버가 사용할 수 있도록 로직과 암호화된 비밀 정보를 Edge KV로 미리 배포.
*   **콘솔**: MVP에서는 제공하지 않으며, 모든 관리는 CLI로 수행.

### 3. Server (`Santokit-Server`)
*   **위치**: 런타임 불가지론적 (Cloudflare Workers, Docker, AWS Lambda 등).
*   **역할**: "다리" 및 "근육" (데이터 플레인).
*   **주요 책임**:
    *   **실행**: 인증을 검증하고 Edge KV에 있는 로직을 실행.
    *   **제로 레이턴시**: 사용자와 가장 가까운 엣지 노드에서 실행.
    *   **보안**: 환경 키를 사용하여 메모리 내에서 DB 자격 증명 복호화.
    *   **프록시**: DB 연결 및 객체 스토리지 상호 작용 관리.

### 4. Client (`Santokit-Client`)
*   **위치**: 또 다른 프론트엔드 애플리케이션 (브라우저/Node).
*   **역할**: "인터페이스" 및 "마법".
*   **주요 책임**:
    *   **가상 타이핑**: 소스 트리 내에 실제 TS 파일을 생성하지 않고도 완전한 IntelliSense 제공.
    *   **프록시 호출**: 함수 호출을 가로채서 서버로 라우팅.
    *   **네임스페이스**:
        *   `stk.auth`: 신원(Identity) 관리.
        *   `stk.logic`: 비즈니스 로직 실행.

## 확장성 전략 (Strategies for Scale)

물리적인 DB 위치로 인한 지연 시간을 극복하고, 글로벌 규모의 퍼포먼스를 내기 위해 다음 전략을 기본적으로 채택합니다.

### 1. 스마트 캐싱 (Smart Caching)
*   **Edge Caching**: 로직 파일에 `cache: 60s` 등의 지시어만 추가하면, Santokit Server가 자동으로 실행 결과를 Edge에 캐싱합니다.
*   **Zero Latency**: 캐시 히트 시 DB 연결 없이 즉시 응답하므로, 물리적 거리를 완전히 무시할 수 있습니다.



## 배포 모델 (Deployment Options)

Santokit는 관리형의 편리함과 셀프 호스팅의 자유를 모두 제공합니다.

### 1. Managed Cloud (기본)
*   `stk logic apply` 한 번으로 전 세계 Edge에 배포.
*   Hub가 모든 인프라 프로비저닝, 보안 패치, 스케일링을 관리.

### 2. Standalone Self-Host (Docker)
*   `docker run santokit/platform` 명령 하나로 실행 가능한 "All-in-One" 컨테이너 제공.
*   Hub, Server, DB(Postgres)가 하나의 컨테이너에 내장되어 있어 인프라 복잡성 없이 즉시 시작 가능.
*   폐쇄망(On-Premise) 환경이나 개인 프로젝트에 최적화.

## 상호 작용 흐름 (라이프사이클)

1.  **개발 (Develop)**: 사용자가 `logic/users/get.sql`을 수정합니다.
2.  **배포 (Deploy `stk logic apply`)**: `stk`가 파일을 파싱하고, YAML을 검증한 뒤 Hub로 업로드합니다.
3.  **프로비저닝 (Provision)**: Hub가 로직을 검증하고, 필요한 비밀 정보를 암호화하여 패키지를 **Edge KV**로 푸시합니다.
4.  **동기화 (Sync `stk sync`)**: `stk`가 Hub에서 API 매니페스트를 다운로드하고 자동 완성을 위해 `node_modules/@santokit/client`를 업데이트합니다.
5.  **런타임 (Runtime)**: 프론트엔드가 `stk.logic.users.get()`을 호출합니다.
    *   Edge Server가 요청을 받습니다.
    *   로컬 **Edge KV**에서 로직과 암호화된 설정을 가져옵니다.
    *   설정을 복호화하고, DB에 연결하여 SQL/WASM을 실행합니다.
    *   결과를 클라이언트에 반환합니다.

## 협업 흐름 (백엔드/프론트)
1. **백엔드**: `logic/` 및 `base/` 수정 → `stk logic apply` / `stk schema plan`.
2. **Hub**: 매니페스트 기록 및 Edge KV 배포.
3. **프론트**: `stk sync`로 최신 매니페스트/타입 동기화 (**Sync는 CLI로만 수행**).
4. **프론트**: `@santokit/client`로 호출 및 UI 개발.
