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

    /// PASETO keys (kid:material or material)
    pub paseto_keys: Vec<String>,

    /// Rate limit max requests per window
    pub rate_limit_max: u32,

    /// Rate limit window seconds
    pub rate_limit_window_secs: u64,
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

            paseto_keys: env::var("STK_PASETO_KEYS")
                .ok()
                .map(|v| {
                    v.split(',')
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default(),

            rate_limit_max: env::var("STK_RATE_LIMIT_MAX")
                .unwrap_or_else(|_| "100".to_string())
                .parse()
                .unwrap_or(100),

            rate_limit_window_secs: env::var("STK_RATE_LIMIT_WINDOW_SECS")
                .unwrap_or_else(|_| "60".to_string())
                .parse()
                .unwrap_or(60),
        })
    }
}
