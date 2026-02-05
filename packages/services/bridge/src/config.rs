//! Bridge 설정

use std::env;

/// Bridge 설정
#[derive(Debug, Clone)]
pub struct Config {
    /// 서버 포트
    pub port: u16,

    /// Hub API URL
    pub hub_url: String,

    /// Auth 비활성화 (개발용)
    pub disable_auth: bool,

    /// 릴리즈 캐시 TTL (초)
    pub release_cache_ttl: u64,
}

impl Config {
    /// 환경변수에서 설정 로드
    pub fn from_env() -> anyhow::Result<Self> {
        Ok(Self {
            port: env::var("STK_BRIDGE_PORT")
                .unwrap_or_else(|_| "3000".to_string())
                .parse()?,

            hub_url: env::var("STK_HUB_URL")
                .unwrap_or_else(|_| "http://localhost:4000".to_string()),

            disable_auth: env::var("STK_DISABLE_AUTH")
                .unwrap_or_else(|_| "false".to_string())
                .parse()
                .unwrap_or(false),

            release_cache_ttl: env::var("STK_RELEASE_CACHE_TTL")
                .unwrap_or_else(|_| "60".to_string())
                .parse()
                .unwrap_or(60),
        })
    }
}
