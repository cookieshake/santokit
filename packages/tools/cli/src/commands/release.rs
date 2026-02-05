//! Release 명령어

use crate::config::CliConfig;
use crate::context::EffectiveContext;

pub async fn current(config: &CliConfig, ctx: &EffectiveContext) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    println!("Current release for {}/{}", project, env);
    // TODO: Hub API 호출
    println!("Release current - not yet implemented");
    Ok(())
}

pub async fn list(config: &CliConfig, ctx: &EffectiveContext, limit: u32) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    println!("Listing releases for {}/{} (limit: {})", project, env, limit);
    // TODO: Hub API 호출
    // 테이블 출력: releaseId, ref, createdAt, status
    println!("Release list - not yet implemented");
    Ok(())
}

pub async fn show(config: &CliConfig, release_id: &str) -> anyhow::Result<()> {
    println!("Showing release: {}", release_id);
    // TODO: Hub API 호출
    // 스냅샷 상세 출력
    println!("Release show - not yet implemented");
    Ok(())
}

pub async fn promote(
    config: &CliConfig,
    ctx: &EffectiveContext,
    from: Option<String>,
    to: &str,
    release_id: Option<String>,
) -> anyhow::Result<()> {
    let project = ctx.require_project()?;

    match (&from, &release_id) {
        (Some(from_env), None) => {
            println!("Promoting from {} to {} in project {}", from_env, to, project);
        }
        (None, Some(rid)) => {
            println!("Promoting release {} to {} in project {}", rid, to, project);
        }
        _ => {
            println!("Promoting current release to {} in project {}", to, project);
        }
    }

    // TODO: Hub API 호출
    println!("Release promote - not yet implemented");
    Ok(())
}

pub async fn rollback(
    config: &CliConfig,
    ctx: &EffectiveContext,
    to_release_id: &str,
) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    println!("Rolling back {}/{} to release {}", project, env, to_release_id);
    // TODO: Hub API 호출
    println!("Release rollback - not yet implemented");
    Ok(())
}
