//! Santokit Bridge (Data Plane)
//!
//! `/call` 엔드포인트를 통해 Auto CRUD, Custom Logic, Storage 기능을 제공합니다.

use std::net::SocketAddr;
use std::sync::Arc;

use axum::{middleware::from_fn, routing::post, Router};
use tokio::net::TcpListener;
use tower_http::cors::CorsLayer;
use tower_http::trace::TraceLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

mod config;
mod error;
mod handlers;
mod middleware;
mod state;

use config::Config;
use state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // 환경변수 로드
    dotenvy::dotenv().ok();

    // 로깅 초기화
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| {
            "stk_bridge=debug,tower_http=debug,axum=trace".into()
        }))
        .with(tracing_subscriber::fmt::layer())
        .init();

    // 설정 로드
    let config = Config::from_env()?;
    tracing::info!("Starting Bridge with config: {:?}", config);

    // 앱 상태 초기화
    let state = AppState::new(&config).await?;
    let state = Arc::new(state);

    // 라우터 구성
    let app = create_router(state);

    // 서버 시작
    let addr = SocketAddr::from(([0, 0, 0, 0], config.port));
    tracing::info!("Bridge listening on {}", addr);

    let listener = TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}

/// 라우터 생성
fn create_router(state: Arc<AppState>) -> Router {
    Router::new()
        // Core endpoint
        .route("/call", post(handlers::call::handle_call))
        // Health check
        .route("/health", axum::routing::get(handlers::health::health_check))
        // Middleware
        .layer(TraceLayer::new_for_http())
        .layer(CorsLayer::permissive())
        .layer(from_fn(middleware::request_id))
        // State
        .with_state(state)
}
