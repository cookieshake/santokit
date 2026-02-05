//! 환경 명령어

use crate::config::CliConfig;
use crate::context::EffectiveContext;

pub async fn create(config: &CliConfig, ctx: &EffectiveContext, name: &str) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    println!("Creating env '{}' in project '{}'", name, project);
    // TODO: Hub API 호출
    println!("Env create - not yet implemented");
    Ok(())
}

pub async fn list(config: &CliConfig, ctx: &EffectiveContext) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    println!("Listing envs for project '{}'", project);
    // TODO: Hub API 호출
    println!("Env list - not yet implemented");
    Ok(())
}
