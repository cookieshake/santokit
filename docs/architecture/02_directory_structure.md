# 02. 디렉토리 구조 및 구성 (Spec)

## 범위
이 문서는 **Santokit User Project** 디렉토리 구조를 정의한다.

## 기본 구조 (Spec)
```
project-root/
├── schema/              # DB 스키마 (HCL)
│   ├── main.hcl
├── config/              # 프로젝트 설정 (YAML)
│   ├── databases.yaml
│   ├── auth.yaml
│   └── storage.yaml
├── logic/               # 비즈니스 로직
│   └── users/get.sql
├── .stk/                # 타입/SDK 보조 파일
│   ├── santokit-env.d.ts
│   └── types.d.ts
└── stk.config.json       # 프로젝트 설정
```

## 로직 파일 규칙 (Spec)
- 기본: SQL/JS 단일 파일 + YAML 프론트매터
- 대안: **Twin File 모드**
  - `logic/foo.yaml` (메타데이터)
  - `logic/foo.sql` 또는 `logic/foo.js` (실행 코드)

### 구현 상태
- SQL/JS 단일 파일 프론트매터 ✅ (`packages/cli/internal/engine/parser/parser.go`)
- SQL 블록 주석 프론트매터 ✅ (`/* --- ... --- */` 지원)
- Twin File 모드 ✅ (`packages/cli/internal/commands/logic.go`)

## 로직 가시성 (Spec)
- `_` prefix 파일은 **Private**
- Private 로직은 SDK/외부 호출에서 제외

### 구현 상태
- SDK 타입 생성에서 제외 ✅ (`packages/cli/internal/engine/generator/types.go`)
- 외부 호출 차단 ✅ (`packages/bridge/src/runtime/server.ts`)

## 파일 생성 (Spec)
- `stk init`은 `.stk/`와 `tsconfig.json`을 생성해야 한다.

### 구현 상태
- `.stk/` 및 `tsconfig.json` 생성 ✅ (`packages/cli/internal/commands/init.go`)

