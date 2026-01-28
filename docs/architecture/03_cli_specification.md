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
*   **환경 설정**: `tsconfig.json`과 `.stk/types.d.ts`를 생성하여 VS Code IntelliSense를 활성화합니다.

### `stk dev` (로컬 브리지)
*   **목표**: 설정 없는(Zero-config) 로컬 개발.
*   **동작**:
    1.  **로컬 DB**: 정의된 DB에 대해 Docker 컨테이너를 실행합니다 (또는 기존 컨테이너 사용).
    2.  **로컬 런타임**: Edge 환경을 시뮬레이션하는 경량 Node.js/Bun 기반 로컬 서버를 시작합니다.
    3.  **핫 리로드 (Hot Reload)**: `logic/`을 감시하고 로컬 런타임을 메모리 내에서 즉시 업데이트합니다.
    4.  **프록시**: `@santoki/client`가 `localhost`를 가리키도록 합니다.
    5.  **타입 동기화**: 프로젝트 변경 시 `.stk/types.d.ts`를 자동 갱신합니다.

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
*   **번들링 및 정책 검사**:
    *   **외부 의존성 금지**: 외부 `npm` 패키지 import(`from 'lodash'`)가 발견되면 에러를 발생시킵니다.
    *   **내부 모듈 허용**: 프로젝트 내부 파일 간의 import(`from '../utils'`)는 `esbuild`를 통해 단일 파일로 번들링됩니다.
*   로직을 매니페스트로 번들링하여 Hub로 업로드합니다.

### `stk sync`
*   Hub에서 최신 "매니페스트"를 다운로드합니다.
*   **타입 정의 생성 (Type Definition Generation)**:
    *   프로젝트 루트(기본값) 또는 `stk.config.json`의 `codegen.output` 경로에 `santoki-env.d.ts`를 생성합니다.
    *   "Module Augmentation" 방식을 사용하여 `@santoki/client`의 타입을 확장합니다.
    *   `stk.logic` 네임스페이스에 대한 완벽한 IntelliSense를 제공합니다.

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

## 인증 및 보안 (Authentication)
개발자 경험(DX)과 CI/CD 자동화를 모두 만족시키기 위해 **이원화된 인증 방식**을 사용합니다.

### 1. 로컬 개발: 브라우저 기반 OAuth (Browser-based flow)
*   **대상**: 로컬 머신에서 `stk dev`, `stk push` 등을 실행하는 개발자.
*   **동작**:
    1.  `stk login` 실행 시 로컬호스트 웹 서버 시작 (랜덤 포트).
    2.  브라우저를 열어 Hub 로그인 페이지로 리다이렉트.
    3.  로그인 성공 시 인증 코드(Auth Code)를 로컬 CLI로 콜백.
    4.  CLI가 이를 Access/Refresh Token으로 교환하여 로컬 보안 저장소에 저장.
*   **저장소**: OS 시스템 키체인 또는 `~/.santoki/credentials` (프로젝트 내부 아님).

### 2. CI/CD 및 서버: Personal Access Token (PAT)
*   **대상**: GitHub Actions, Docker 컨테이너, 헤드리스 환경.
*   **동작**:
    1.  Hub 콘솔에서 토큰 생성 (예: `stk_pat_...`).
    2.  환경 변수 `STK_TOKEN` 또는 `stk login --token`으로 주입.
*   **특징**: 유효 기간 설정 가능, 특정 권한 스코프 제한 가능.
