# 03. CLI 명세 (`stk`)

## 역할
지능형 에이전트. 단순한 업로더가 아니라 파서, 컴파일러, 동기화 도구(Synchronizer)입니다.

## 4가지 핵심 엔진
1.  **스캐너 (Scanner)**: santoki 프로젝트 파일의 변경 사항을 감시합니다. `.gitignore` 및 `node_modules`는 무시합니다.
2.  **파서 (Parser)**: 파일에서 메타데이터(YAML)를 추출합니다. "단일 파일"(주석 파싱) 및 "트윈 파일"(병합) 전략을 처리합니다.
3.  **통합기 (Integrator)**: 가상 타이핑(Virtual Typing)을 위해 `node_modules` 수정을 관리합니다.
4.  **커뮤니케이터 (Communicator)**: Hub API 인증 클라이언트입니다.

## 주요 명령어

### `stk init`
*   santoki 프로젝트 디렉토리의 스캐폴딩을 생성합니다.
*   `stk.config.json`을 통해 프로젝트를 Hub에 연결합니다 (비밀 정보가 아닌 프로젝트 ID 저장).

### `stk dev` (로컬 브리지)
*   **목표**: 설정 없는(Zero-config) 로컬 개발.
*   **동작**:
    1.  **로컬 DB**: 정의된 DB에 대해 Docker 컨테이너를 실행합니다 (또는 기존 컨테이너 사용).
    2.  **로컬 런타임**: Edge 환경을 시뮬레이션하는 경량 Go 기반 로컬 서버를 시작합니다.
    3.  **핫 리로드 (Hot Reload)**: `logic/`을 감시하고 로컬 런타임을 메모리 내에서 즉시 업데이트합니다.
    4.  **프록시**: `@santoki/client`가 `localhost`를 가리키도록 합니다.

### `stk base [push | plan]`
*   **타겟 배포**:
    *   `stk base push`: 전체를 검사하고 변경 사항을 계획합니다.
    *   `stk base push db`: `.hcl` 파일만 스캔합니다.
    *   `stk base push auth`: `auth.yaml`만 스캔합니다.
    *   `stk base push main`: `main.hcl`만 스캔합니다.
*   **안전성**: 항상 `plan`(드라이 런)을 먼저 실행합니다. 차이점(diff)을 보여주고 확인을 요구합니다.

### `stk logic push`
*   `logic/`을 스캔합니다.
*   로컬에서 YAML 스키마를 검증(린팅)합니다.
*   로직을 매니페스트로 번들링합니다.
*   Hub로 업로드합니다.

### `stk sync`
*   Hub에서 최신 "매니페스트"를 다운로드합니다.
*   **가상 타입 주입 (Virtual Type Injection)**:
    *   `node_modules/@santoki/client/dist/index.d.ts`를 찾습니다.
    *   매니페스트에서 생성된 타입 정의로 덮어씁니다.
    *   `stk.logic.users.get(...)` 자동 완성을 즉시 활성화합니다.

### `stk secret set [KEY] [VALUE]`
*   비밀 정보를 Hub Vault(TLS)로 직접 전송합니다.
*   절대 디스크에 쓰지 않습니다.

## 파싱 로직 (하이브리드 접근 방식)
1.  **스캔 (Scan)**: `glue/` 또는 `logic/`을 탐색합니다.
2.  **매칭 (Match)**:
    *   `.sql` 파일이 발견되면: 같은 이름의 인접한 `.yaml` 파일이 있는지 확인합니다.
    *   **있음**: YAML 내용을 SQL 본문과 병합합니다.
    *   **없음**: SQL 파일의 첫 번째 블록 주석 `/* --- ... --- */`을 YAML로 읽습니다.
3.  **검증 (Validate)**: JSON Schema에 대해 확인합니다. 유효하지 않은 경우 줄 번호와 함께 강제로 실패 처리합니다.
