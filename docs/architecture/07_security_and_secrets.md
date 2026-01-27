# 07. 보안 및 비밀 정보 (Security & Secrets)

## 비밀 정보 관리 전략
**"비밀 정보는 리포지토리가 아니라 볼트(Vault)에 있어야 합니다."**

### 1. 격리 (Isolation)
*   비밀 정보는 절대 `santoki/*.yaml`이나 `.hcl`에 쓰지 마세요.
*   비밀 정보를 Git에 체크인하지 마세요.
*   로컬 `.env` 파일은 권장되지 않으며 `stk dev`에 의해 엄격하게 관리됩니다.

### 2. 주입 흐름 (Injection Flow)
1.  **정의**: `auth.yaml`에서 `${GOOGLE_CLIENT_SECRET}`을 사용합니다.
2.  **저장**: 사용자가 `stk secret set GOOGLE_CLIENT_SECRET "xyz"`를 실행합니다. 값이 Hub Vault(암호화됨)로 이동합니다.
3.  **배포**:
    *   Hub가 Vault에서 비밀 정보를 검색합니다.
    *   **프로젝트 마스터 키** (Edge와 공유됨)로 재암호화합니다.
    *   Edge KV의 Config JSON에 번들링합니다.
4.  **런타임**: Edge Server가 사용 직전에 메모리에서 값을 복호화합니다.

## 인증 (사용자 대상)
*   **공급자(Providers)**: `base/auth.yaml`에 정의됨 (Google, GitHub, Email/Pass).
*   **세션**: Santoki가 관리 (JWT/Sessions).
*   **RBAC**:
    *   `auth.yaml`에 정의된 역할.
    *   로직 파일이 `access: "admin"` 또는 `access: "authenticated"`를 지정합니다.
    *   서버는 로직을 실행하기 *전에* 이 접근 권한을 검증합니다.

## 인프라 보안
*   **DB 연결**:
    *   Hub는 IP 화이트리스트에 등록된 마이그레이션 러너(Atlas)를 통해 연결합니다.
    *   Edge는 보안 터널링 또는 승인된 프록시(Hyperdrive)를 통해 연결합니다.
*   **Edge 토큰**: Edge는 KV 및 기타 리소스에 액세스하기 위해 회전 가능한(rotation-capable) 토큰이 있는 제한된 환경에서 실행됩니다.
