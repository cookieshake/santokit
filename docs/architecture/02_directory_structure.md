# 02. 디렉토리 구조 및 구성

> **[주의] 문맥 명확화**
> Santokit와 관련된 프로젝트는 크게 다음 3가지로 나뉩니다:
> 1. **Santokit Platform**: 이 리포지토리 자체 (Santokit 플랫폼 소스 코드).
> 2. **Santokit User Project**: 사용자가 Santokit를 사용하여 만드는 백엔드 프로젝트 (로직 및 스키마 정의).
> 3. **Client App**: Santokit User Project에 연결하여 사용하는 프론트엔드 애플리케이션.
>
> **이 문서는 2번 "Santokit User Project"의 디렉토리 구조를 설명합니다.** 1번이나 3번과는 관련이 없으므로 혼동하지 않도록 주의해 주세요.


## 핵심 구조: 2단계 깊이
Santokit는 엄격한 "Simple is Best" 철학을 따릅니다. 명확한 관심사 분리를 유지하면서 중첩 지옥(nesting hell)을 피하기 위해 구조를 세 개의 메인 디렉토리로 평탄화했습니다.

```text
sample-santokit-project/
├── base/                # [스키마] DB 스키마 정의 (Schema)
│   ├── main.hcl         # [DB 스키마] 별칭: 'main'
│   ├── logs.hcl         # [DB 스키마] 별칭: 'logs'
├── config/              # [설정] 프로젝트 설정 (Config)
│   ├── databases.yaml   # [설정] DB 연결/별칭
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

## 1. `base/` 디렉토리 (스키마)
DB 스키마(IaC) 정의를 포함합니다. 이곳의 변경 사항은 영향력이 크며 `stk schema plan`을 통해 처리됩니다.

*   **멀티 DB 전략 (파일을 별칭으로 사용)**:
    *   `filename.hcl`은 DB 별칭에 직접 매핑됩니다.
    *   예: `santokit/base/analytics.hcl`은 로직 파일에서 `target: analytics`로 참조할 수 있는 DB 리소스를 생성합니다.
## 2. `config/` 디렉토리 (프로젝트 설정)
프로젝트 설정을 관리합니다. `stk config apply`로 Hub에 반영합니다.

*   **예약된 설정 파일**:
    *   `databases.yaml`: DB 연결/별칭 및 기본 설정.
    *   `auth.yaml`: 자격 증명 공급자(Identity Provider), 세션 규칙, RBAC 역할.
    *   `storage.yaml`: 스토리지 버킷 정의 (공급자, 공개 여부 등). 복잡한 권한 규칙은 제거되었습니다 (로직으로 위임).

## 3. `logic/` 디렉토리 (애플리케이션)
서버에서 실행되는 실제 함수들을 포함합니다. `stk logic apply`를 통해 처리됩니다.

    *   **단일 파일 (권장)**: 주석에 YAML Frontmatter가 포함된 SQL/JS 파일.
        *   파일 수를 적게 유지합니다.
        *   단순하거나 중간 정도 복잡도의 쿼리에 가장 적합합니다.

## 4. 로직 가시성 (Logic Visibility)
**캡슐화**를 위해 파일명 규칙을 사용하여 로직의 노출 여부를 결정합니다.

*   **Public (기본값)**: `users/get.sql`
    *   클라이언트 SDK (`stk.logic.users.get`)에 노출됩니다.
    *   외부 API로 직접 호출 가능합니다.
*   **Internal (Private)**: `users/_insert.sql` (`_` 접두사)
    *   **클라이언트 SDK에 노출되지 않습니다.**
    *   외부 API 호출 시 접근이 거부됩니다.
    *   오직 다른 **JS 로직** 내부에서 `context.invoke('users/_insert', ...)` 형태로만 호출할 수 있습니다.
    *   *용도: 유효성 검사, 전처리 로직이 필수적인 SQL 쿼리를 숨길 때 사용.*

## 5. 설정 및 인텔리센스 (IntelliSense)
YAML 설정에서 타입 안전성과 정확성을 보장하기 위해:

*   **JSON 스키마**: Hub가 스키마를 호스팅합니다 (예: `api.santokit.com/schemas/auth.json`).

## 6. 비밀 정보(Secret) 관리 규칙
*   **엄격한 분리**: 비밀 정보는 절대 `*.yaml`이나 `*.hcl` 파일에 들어가지 않습니다.
*   **플레이스홀더**: YAML/HCL에서 `${VAR_NAME}` 문법을 사용합니다.
*   **볼트(Vault)**: 실제 값은 `stk secret set`을 통해 Hub Vault에 저장됩니다.
