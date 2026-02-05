//! Connections 명령어

use crate::config::CliConfig;
use crate::context::EffectiveContext;

pub async fn set(
    config: &CliConfig,
    ctx: &EffectiveContext,
    name: &str,
    engine: &str,
    db_url: &str,
) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    println!("Setting connection '{}' for {}/{}", name, project, env);
    println!("  Engine: {}", engine);
    println!("  URL: {}", mask_url(db_url));
    // TODO: Hub API 호출
    println!("Connection set - not yet implemented");
    Ok(())
}

pub async fn test(
    config: &CliConfig,
    ctx: &EffectiveContext,
    name: Option<&str>,
) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;
    let conn_name = name.or(ctx.connection.as_deref()).unwrap_or("main");

    println!("Testing connection '{}' for {}/{}", conn_name, project, env);
    // TODO: Hub API 호출
    println!("Connection test - not yet implemented");
    Ok(())
}

pub async fn list(config: &CliConfig, ctx: &EffectiveContext) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    println!("Listing connections for {}/{}", project, env);
    // TODO: Hub API 호출
    println!("Connection list - not yet implemented");
    Ok(())
}

fn mask_url(url: &str) -> String {
    // 비밀번호 등 민감 정보 마스킹
    if let Some(at_pos) = url.find('@') {
        if let Some(proto_end) = url.find("://") {
            let proto = &url[..proto_end + 3];
            let rest = &url[at_pos..];
            return format!("{}****{}", proto, rest);
        }
    }
    url.to_string()
}
