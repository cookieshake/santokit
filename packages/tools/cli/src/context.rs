//! Repo Context 관리
//!
//! `.stk/context.json` 파일을 통해 repo-local 컨텍스트를 관리합니다.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

/// Repo Context
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct RepoContext {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hub_url: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub project: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<String>,

    #[serde(skip_serializing_if = "Option::is_none")]
    pub connection: Option<String>,
}

/// Effective Context (최종 결정된 컨텍스트)
#[derive(Debug, Clone)]
pub struct EffectiveContext {
    pub hub_url: Option<String>,
    pub project: Option<String>,
    pub env: Option<String>,
    pub connection: Option<String>,
}

impl EffectiveContext {
    /// project 필수 검증
    pub fn require_project(&self) -> anyhow::Result<&str> {
        self.project
            .as_deref()
            .ok_or_else(|| anyhow::anyhow!("Project not specified. Use --project or 'stk context set'"))
    }

    /// env 필수 검증
    pub fn require_env(&self) -> anyhow::Result<&str> {
        self.env
            .as_deref()
            .ok_or_else(|| anyhow::anyhow!("Env not specified. Use --env or 'stk context set'"))
    }
}

impl RepoContext {
    /// 컨텍스트 파일 경로
    fn context_path() -> PathBuf {
        PathBuf::from(".stk/context.json")
    }

    /// 컨텍스트 로드
    pub fn load() -> anyhow::Result<Self> {
        let path = Self::context_path();
        if path.exists() {
            let content = std::fs::read_to_string(&path)?;
            let ctx: RepoContext = serde_json::from_str(&content)?;
            Ok(ctx)
        } else {
            Ok(Self::default())
        }
    }

    /// 컨텍스트 저장
    pub fn save(&self) -> anyhow::Result<()> {
        let path = Self::context_path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let content = serde_json::to_string_pretty(self)?;
        std::fs::write(&path, content)?;
        Ok(())
    }

    /// 컨텍스트 삭제
    pub fn clear() -> anyhow::Result<()> {
        let path = Self::context_path();
        if path.exists() {
            std::fs::remove_file(&path)?;
        }
        Ok(())
    }
}

/// 컨텍스트 결정 (CLI 옵션 > repo context)
pub fn resolve_context(
    hub: Option<&str>,
    project: Option<&str>,
    env: Option<&str>,
) -> anyhow::Result<EffectiveContext> {
    let repo_ctx = RepoContext::load().unwrap_or_default();

    Ok(EffectiveContext {
        hub_url: hub.map(|s| s.to_string()).or(repo_ctx.hub_url),
        project: project.map(|s| s.to_string()).or(repo_ctx.project),
        env: env.map(|s| s.to_string()).or(repo_ctx.env),
        connection: repo_ctx.connection,
    })
}
