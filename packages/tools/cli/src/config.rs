//! CLI 설정

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// CLI 설정
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CliConfig {
    /// 저장된 인증 토큰
    pub auth_token: Option<String>,

    /// 기본 Hub URL
    pub default_hub: Option<String>,
}

impl CliConfig {
    /// 설정 파일 경로
    fn config_path() -> anyhow::Result<PathBuf> {
        let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("Cannot find home directory"))?;
        Ok(home.join(".stk").join("config.json"))
    }

    /// 설정 로드
    pub fn load() -> anyhow::Result<Self> {
        let path = Self::config_path()?;
        if path.exists() {
            let content = std::fs::read_to_string(&path)?;
            let config: CliConfig = serde_json::from_str(&content)?;
            Ok(config)
        } else {
            Ok(Self::default())
        }
    }

    /// 설정 저장
    pub fn save(&self) -> anyhow::Result<()> {
        let path = Self::config_path()?;
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string_pretty(self)?;
        std::fs::write(&path, content)?;
        Ok(())
    }

    /// Hub URL 결정
    pub fn hub_url(&self) -> anyhow::Result<String> {
        self.default_hub
            .clone()
            .or_else(|| std::env::var("STK_HUB_URL").ok())
            .ok_or_else(|| anyhow::anyhow!("Hub URL not configured. Use 'stk context set --hub <url>' or set STK_HUB_URL"))
    }

    /// 인증 토큰 결정
    pub fn get_auth_token(&self) -> anyhow::Result<String> {
        self.auth_token
            .clone()
            .or_else(|| std::env::var("STK_AUTH_TOKEN").ok())
            .ok_or_else(|| anyhow::anyhow!("Not logged in. Use 'stk login' first."))
    }
}
