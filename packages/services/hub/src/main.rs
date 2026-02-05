//! Santokit Hub (Control Plane)
//!
//! org/team/project/env 관리, 스키마/권한/릴리즈 관리를 담당합니다.

use std::net::SocketAddr;

use axum::Router;
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 환경변수 로드
    dotenvy::dotenv().ok();

    // 로깅 초기화
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            "stk_hub=debug,tower_http=debug".into()
        }))
        .with(tracing_subscriber::fmt::layer())
        .init();

    tracing::info!("Starting Hub...");

    // 라우터 구성
    let app = Router::new()
        // Health check
        .route("/health", axum::routing::get(health_check))
        // TODO: API 라우트 추가
        // - /api/projects
        // - /api/envs
        // - /api/connections
        // - /api/releases
        // - /api/endusers (issuer mode)
        // - /oidc/:provider/* (external OIDC)
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive());

    // 서버 시작
    let port: u16 = std::env::var("STK_HUB_PORT")
        .unwrap_or_else(|_| "4000".to_string())
        .parse()?;

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Hub listening on {}", addr);

    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check() -> &'static str {
    "ok"
}

// ─────────────────────────────────────────────────────────────────────────────
// Hub API 구조 (TODO: 후속 구현)
// ─────────────────────────────────────────────────────────────────────────────
//
// ## Operator APIs (CLI가 호출)
//
// POST   /api/auth/login           - Operator 로그인
// POST   /api/auth/logout          - Operator 로그아웃
// GET    /api/auth/me              - 현재 Operator 정보
//
// POST   /api/projects             - 프로젝트 생성
// GET    /api/projects             - 프로젝트 목록
// GET    /api/projects/:id         - 프로젝트 상세
//
// POST   /api/projects/:id/envs    - 환경 생성
// GET    /api/projects/:id/envs    - 환경 목록
//
// POST   /api/connections          - Connection 등록
// GET    /api/connections          - Connection 목록
// POST   /api/connections/:id/test - Connection 테스트
//
// POST   /api/apikeys              - API Key 생성
// GET    /api/apikeys              - API Key 목록
// DELETE /api/apikeys/:id          - API Key 폐기
//
// POST   /api/apply                - Unified Apply (schema + permissions + release)
// GET    /api/releases             - Release 목록
// GET    /api/releases/current     - Current Release
// POST   /api/releases/promote     - Release 승격
// POST   /api/releases/rollback    - Release 롤백
//
// ## End User APIs (Hub Issuer Mode)
//
// POST   /api/endusers/signup      - 회원가입
// POST   /api/endusers/login       - 로그인
// POST   /api/endusers/token       - 토큰 갱신
// POST   /api/endusers/logout      - 로그아웃
//
// ## External OIDC
//
// GET    /oidc/:provider/start     - OIDC 시작
// GET    /oidc/:provider/callback  - OIDC 콜백
//
// ## Internal (Bridge가 호출)
//
// GET    /internal/releases/:project/:env/current  - 현재 릴리즈 조회
// GET    /internal/apikeys/verify                  - API Key 검증
// ─────────────────────────────────────────────────────────────────────────────
