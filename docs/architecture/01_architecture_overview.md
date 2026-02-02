# 01. Santokit 아키텍처 개요 (Spec)

## 목적
Santokit은 백엔드 인프라의 복잡성을 추상화하여 개발자가 **비즈니스 로직과 스키마**에만 집중하도록 만드는 플랫폼이다.

## 상태 표기
- ✅ 구현됨
- 🟡 부분 구현
- ❌ 미구현

## 핵심 구성 요소

### 1) CLI (`stk`)
- **존재 의의**: 개발자의 로컬에서 파일 스캔/파싱/타입 생성/배포를 자동화해 “Hub와의 연결 고리” 역할을 한다.
- **행동**: 로직/스키마/설정 파일을 스캔하고, 매니페스트 생성 후 Hub로 전송한다. Hub에서 최신 매니페스트를 받아 타입 정의를 생성한다.
- **동작**: 로컬 디렉토리를 순회해 파일을 파싱 → 유효성 검사 → 번들 생성 → Hub API 호출.
- **상태**: 🟡 (OAuth 로그인 플로우는 미완성)

### 2) Hub (Control Plane)
- **존재 의의**: 프로젝트/보안/배포의 단일 진실 원천(Source of Truth) 역할을 한다.
- **행동**: 매니페스트 저장, 프로젝트 설정 저장, 비밀정보 암호화, 스키마 플랜/적용, Edge KV 최신 번들 배포.
- **동작**: API 요청을 받아 저장소에 기록하고, 최신 번들을 `project:{id}:latest`로 프로비저닝한다.
- **상태**: 🟡 (OAuth 및 일부 보안 정책 미완성)

### 3) Server/Bridge (Data Plane)
- **존재 의의**: 사용자 요청을 실제로 실행하는 런타임이다.
- **행동**: 요청을 받고 로직 번들을 로드 → 인증/권한 확인 → SQL/JS 실행 → 결과 반환. 캐시 적용.
- **동작**: Edge KV에서 로직 번들을 로드하고, DB/스토리지에 접근한다.
- **상태**: 🟡 (런타임별 어댑터 품질 편차)

### 4) Client SDK
- **존재 의의**: 프론트/서버 앱에서 타입 안전한 방식으로 Santokit 로직을 호출하게 해준다.
- **행동**: 프록시를 통해 `/call` API 호출, auth 모듈 제공.
- **동작**: `stk.sync`로 생성된 타입을 통해 정적 타입 보강을 제공한다.
- **상태**: 🟡 (OAuth 플로우 미완성)

## 전체 흐름
1. **개발**: 로직/스키마 작성
2. **배포**: `stk logic apply` → Hub
3. **프로비저닝**: Hub → Edge KV 최신 번들 배포
4. **동기화**: `stk sync` → 타입 정의 생성
5. **런타임 호출**: Client SDK → `/call` → Server 실행

---

## 실행 흐름 (시퀀스 텍스트)

아래는 **현재 구현에 존재하는 모든 주요 흐름**을 요약한 것이다. 각 흐름은 존재 의의/행동/동작을 포함하며, CLI 명령 예시를 함께 제공한다.

### A) 프로젝트 초기화 (Init)
1) 개발자: `stk init my-project`  
2) CLI: 디렉토리 생성 (`schema/`, `config/`, `logic/`, `.stk/`)  
3) CLI: `stk.config.json`, `tsconfig.json`, 샘플 파일 생성  

### B) 프로파일 설정 (Profile)
1) 개발자: `stk profile set dev --hub-url https://hub.santokit.dev --project-id prj_123 --token <token>`  
2) CLI: `~/.santokit/config.json`에 저장  
3) 개발자: `stk profile use dev`  
4) CLI: 현재 프로파일로 전환  

### C) 프로젝트 컨텍스트 설정 (Project)
1) 개발자: `stk project set prj_123`  
2) CLI: 현재 프로파일의 프로젝트 ID 업데이트  
3) 개발자: `stk project auth set <token>`  
4) CLI: 토큰 저장  

### D) 스키마 플랜 (Schema Plan)
1) 개발자: `stk schema plan`  
2) CLI: `schema/*.hcl` 스캔  
3) CLI → Hub: `POST /api/v1/schema/plan` (헤더: `X-Santokit-Project-ID`)  
4) Hub: Atlas 기반 diff 계산  
5) CLI: plan 결과 출력  

### E) 스키마 적용 (Schema Apply)
1) 개발자: `stk schema apply`  
2) CLI: plan 요청 후 확인 프롬프트  
3) CLI → Hub: `POST /api/v1/schema/apply` (헤더: `X-Santokit-Project-ID`)  
4) Hub: 마이그레이션 적용  

### F) 설정 적용 (Config Apply)
1) 개발자: `stk config apply`  
2) CLI: `config/*.yaml` 로드  
3) CLI → Hub: `POST /api/v1/config/apply` (헤더: `X-Santokit-Project-ID`)  
4) Hub: 프로젝트 설정 저장  

### G) 로직 배포 (Logic Apply)
1) 개발자: `stk logic apply`  
2) CLI: `logic/` 스캔 → YAML 파싱 → 번들 생성  
3) CLI → Hub: `POST /api/v1/manifest` (헤더: `X-Santokit-Project-ID`)  
4) Hub: 매니페스트 저장  
5) Hub: `project:{id}:latest` 번들 생성  
6) Hub → Edge KV: 최신 번들 업로드  

### H) 로직 검증 (Logic Validate)
1) 개발자: `stk logic validate`  
2) CLI: 로직 파일 파싱/검증만 수행  
3) 오류가 있으면 실패, 없으면 통과  

### I) 타입 동기화 (Sync)
1) 개발자: `stk sync`  
2) CLI → Hub: `GET /api/v1/manifest` (헤더: `X-Santokit-Project-ID`)  
3) Hub: 최신 매니페스트 반환  
4) CLI: 타입 정의 생성 (`codegen.output` 경로)  

### J) 비밀 정보 등록 (Secrets)
1) 개발자: `stk secret set DB_URL \"postgres://...\"`  
2) CLI → Hub: `POST /api/v1/secrets` (헤더: `X-Santokit-Project-ID`)  
3) Hub: AES-256-GCM 암호화 저장  

### K) 비밀 정보 조회/삭제 (Secrets)
1) 개발자: `stk secret list`  
2) CLI → Hub: `GET /api/v1/secrets` (헤더: `X-Santokit-Project-ID`)  
3) Hub: 키 목록 반환  
4) 개발자: `stk secret delete DB_URL`  
5) CLI → Hub: `DELETE /api/v1/secrets/DB_URL` (헤더: `X-Santokit-Project-ID`)  

### L) 런타임 호출 (Client → Server)
1) Client SDK: `stk.logic.users.get({ id: 123 })`  
2) SDK → Server: `POST /call { path: \"users/get\", params: { id: 123 } }`  
3) Server: KV에서 번들 로드 (`project:{id}:latest` 또는 개별 키)  
4) Server: 인증/권한 확인  
5) Server: SQL/JS 실행  
6) Server → Client: 결과 반환  

### M) 캐시 적용 (Server Cache)
1) 로직 파일에 `cache: \"1m\"` 설정  
2) Server: 요청 파라미터를 안정적 직렬화하여 캐시 키 생성  
3) Cache HIT이면 즉시 반환, MISS이면 실행 후 저장  

### N) 스토리지 업로드/다운로드 (Presign)
1) 로직 내부에서 `context.storage.createUploadUrl(bucket, path)` 호출  
2) Server: SigV4 presign 생성  
3) 클라이언트: presigned URL로 직접 업로드  
4) 다운로드는 `createDownloadUrl` 동일 패턴  

### O) 스토리지 삭제 (Delete)
1) 로직 내부에서 `context.storage.delete(bucket, path)` 호출  
2) Server: presigned DELETE 요청 수행  

### P) 인증 로그인 (SDK Auth)
1) Client: `stk.auth.login({ email, password })`  
2) SDK → Hub: `POST /auth/login`  
3) Hub: JWT 발급  
4) SDK: 토큰 저장  

### Q) 인증 사용자 조회 (SDK Auth)
1) Client: `stk.auth.me()`  
2) SDK → Hub: `GET /auth/me` (Bearer 토큰)  
3) Hub: 사용자 정보 반환  
