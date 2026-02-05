//! API Key 명령어

use crate::config::CliConfig;
use crate::context::EffectiveContext;

pub async fn create(
    config: &CliConfig,
    ctx: &EffectiveContext,
    name: &str,
    roles: &str,
) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    println!("Creating API key for {}/{}", project, env);
    println!("  Name: {}", name);
    println!("  Roles: {}", roles);
    // TODO: Hub API 호출
    // 성공 시 keyId와 apiKey 출력 (apiKey는 1회만)
    println!("API key create - not yet implemented");
    Ok(())
}

pub async fn list(config: &CliConfig, ctx: &EffectiveContext) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    println!("Listing API keys for {}/{}", project, env);
    // TODO: Hub API 호출
    // 테이블 출력: keyId, name, roles, status, createdAt, lastUsedAt
    println!("API key list - not yet implemented");
    Ok(())
}

pub async fn revoke(
    config: &CliConfig,
    ctx: &EffectiveContext,
    key_id: &str,
) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    println!("Revoking API key '{}' for {}/{}", key_id, project, env);
    // TODO: Hub API 호출
    println!("API key revoke - not yet implemented");
    Ok(())
}
