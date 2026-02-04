# Implementation Plan (Tech Stack & Architecture)

Santokit의 구현 기술 스택과 아키텍처를 정의한다.
핵심 엔진(Bridge, Hub, CLI)은 **Rust**로 구현하여 성능과 안정성을 확보하고, SDK는 다양한 언어를 지원하는 Polyglot Monorepo 구조를 채택한다.

---

## 1. Directory Structure (Unified Monorepo)

언어(`rs`, `ts`)가 아닌 **역할(Role)** 중심으로 디렉토리를 구조화한다.

```
santokit/
├── Cargo.toml            # Rust Workspace Root
├── package.json          # Node Workspace Root (pnpm)
├── moon.yml              # Polyglot Task Runner (Build Pipeline)
│
├── packages/
│   ├── services/
│   │   ├── bridge/       # [Rust] Data Plane Runtime (Web Server)
│   │   └── hub/          # [Rust] Control Plane API (Web Server)
│   │
│   ├── tools/
│   │   └── cli/          # [Rust] 'stk' Operator CLI
│   │
│   ├── libs/
│   │   ├── core-rs/      # [Rust] Shared Structs, Parser, Validations
│   │   └── sql-rs/       # [Rust] Dynamic SQL Generator (Schema -> SQL)
│   │
│   └── sdks/
│       ├── typescript/   # [TypeScript] JS Client SDK
│       ├── python/       # [Python] Py Client SDK
│       └── swift/        # [Swift] iOS Client SDK
```

---

## 2. Tech Stack (Rust Core)

서버 및 CLI는 Rust로 구현한다. 

### A. Web Server (Bridge & Hub)
*   **Framework:** **Axum**
    *   Tokio 기반의 고성능, 모던 비동기 웹 프레임워크.
    *   Type-safe routing 및 깔끔한 에러 핸들링 지원.
*   **Runtime:** **Tokio** (Standard Async Runtime)
*   **State Management:** `Arc<AppState>` 패턴 사용 (DB Pool, Cache 공유).

### B. Database Access
*   **Driver:** **SQLx**
    *   Pure Rust Async Driver (Postgres).
    *   Connection Pooling 내장.
*   **Query Building (Dynamic):** **SeaQuery**
    *   `schema.md` 메타데이터를 기반으로 런타임에 SQL을 동적 생성.
    *   `sql-rs` 라이브러리에서 로직을 캡슐화하여 SQL Injection 원천 차단.

### C. CLI (`stk`)
*   **Parser:** **Clap** (Derive API)
*   **Interaction:** `inquire` (Prompt), `indicatif` (Spinner/Progress).
*   **Table Output:** `comfy-table` (터미널 테이블 출력).

### D. Core Logic (`core-rs`)
*   **Serialization:** **Serde** (`serde_json`, `serde_yaml`)
*   **CEL Parser:** `cel-parser` (Google Common Expression Language 구현체)
    *   권한 Condition 평가 및 SQL Where절 변환 로직 담당.
*   **Schema Validation:** 자체 구현 (Serde + Validator).

---

## 3. Tech Stack (SDKs & Polyglot)

### Build System
*   **Moonrepo** (권장):
    *   Rust(Cargo)와 Node(Pnpm) 태스크를 통합 관리.
    *   캐싱 및 병렬 빌드 지원.

### TypeScript SDK
*   **Runtime:** Node.js / Browser / Edge 호환.
*   **HTTP Client:** `fetch` API 기반 (Dependency Free 지향).
*   **Build:** `tsup` (esbuild 기반).

---

## 4. Work Plan (Phases)

### Phase 1: Core & Schema
1.  `workspace` 설정 (Cargo, Pnpm, Moon).
2.  `packages/libs/core-rs`: 스키마 YAML 파서 및 구조체 정의.
3.  `packages/libs/sql-rs`: SeaQuery 기반 DDL(CREATE TABLE) 생성기 구현.

### Phase 2: CLI & Migration
1.  `packages/tools/cli`: `stk apply` 구현.
2.  Hub(Mock) 없이 로컬 DB에 직접 연결하여 Schema Apply 테스트.

### Phase 3: Bridge (Runtime)
1.  `packages/services/bridge`: Axum 서버 셋업.
2.  `/call` 엔드포인트 구현 (Auto CRUD 연결).
3.  `sql-rs`: SELECT/INSERT/UPDATE/DELETE 쿼리 생성기 구현.
4.  CEL 기반 권한 파서 연동.

### Phase 4: Storage & Logic
1.  Custom SQL (`logics/`) 파서 및 실행기 구현.
2.  S3 Presigned URL 연동.
