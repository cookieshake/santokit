# 02. 디렉토리 구조 및 구성

> **[주의] 문맥 명확화**
> Santoki와 관련된 프로젝트는 크게 다음 3가지로 나뉩니다:
> 1. **Santoki Platform**: 이 리포지토리 자체 (Santoki 플랫폼 소스 코드).
> 2. **Santoki User Project**: 사용자가 Santoki를 사용하여 만드는 백엔드 프로젝트 (로직 및 스키마 정의).
> 3. **Client App**: Santoki User Project에 연결하여 사용하는 프론트엔드 애플리케이션.
>
> **이 문서는 2번 "Santoki User Project"의 디렉토리 구조를 설명합니다.** 1번이나 3번과는 관련이 없으므로 혼동하지 않도록 주의해 주세요.


## 핵심 구조: 2단계 깊이
Santoki는 엄격한 "Simple is Best" 철학을 따릅니다. 명확한 관심사 분리를 유지하면서 중첩 지옥(nesting hell)을 피하기 위해 구조를 두 개의 메인 디렉토리로 평탄화했습니다.

```text
sample-santoki-project/
├── base/                # [인프라] 토대 (Foundation)
│   ├── main.hcl         # [DB 스키마] 별칭: 'main'
│   ├── logs.hcl         # [DB 스키마] 별칭: 'logs'
│   ├── auth.yaml        # [정책] 인증 설정 (예약된 이름)
│   └── storage.yaml     # [정책] 스토리지 버킷/권한 (예약된 이름)
└── logic/               # [애플리케이션] 비즈니스 로직
    ├── users/           # 네임스페이스 (폴더 이름이 검증 네임스페이스가 됨)
    │   ├── get.sql      # 로직 파일 (SQL + YAML Frontmatter 결합)
    │   └── update.js    # 로직 파일 (JS 핸들러)
    └── orders/
        ├── create.yaml  # [트윈 파일 모드] 메타데이터
        └── create.sql   # [트윈 파일 모드] 순수 SQL
```

## 1. `base/` 디렉토리 (인프라)
Infrastructure-as-Code 정의를 포함합니다. 이곳의 변경 사항은 영향력이 크며 `stk base push`를 통해 처리됩니다.

*   **멀티 DB 전략 (파일을 별칭으로 사용)**:
    *   `filename.hcl`은 DB 별칭에 직접 매핑됩니다.
    *   예: `santoki/base/analytics.hcl`은 로직 파일에서 `target: analytics`로 참조할 수 있는 DB 리소스를 생성합니다.
*   **예약된 설정 파일**:
    *   `auth.yaml`: 자격 증명 공급자(Identity Provider), 세션 규칙, RBAC 역할.
    *   `storage.yaml`: R2/S3 버킷 정의 및 액세스 정책.

## 2. `logic/` 디렉토리 (애플리케이션)
서버에서 실행되는 실제 함수들을 포함합니다. `stk logic push`를 통해 처리됩니다.

*   **파일 형식**:
    *   **단일 파일 (권장)**: 주석에 YAML Frontmatter가 포함된 SQL/JS 파일.
        *   파일 수를 적게 유지합니다.
        *   단순하거나 중간 정도 복잡도의 쿼리에 가장 적합합니다.

## 3. 설정 및 인텔리센스 (IntelliSense)
YAML 설정에서 타입 안전성과 정확성을 보장하기 위해:

*   **JSON 스키마**: Hub가 스키마를 호스팅합니다 (예: `api.santoki.com/schemas/auth.json`).

## 4. 비밀 정보(Secret) 관리 규칙
*   **엄격한 분리**: 비밀 정보는 절대 `*.yaml`이나 `*.hcl` 파일에 들어가지 않습니다.
*   **플레이스홀더**: YAML/HCL에서 `${VAR_NAME}` 문법을 사용합니다.
*   **볼트(Vault)**: 실제 값은 `stk secret set`을 통해 Hub Vault에 저장됩니다.
