//! Release 명령어

use crate::config::CliConfig;
use crate::context::EffectiveContext;
use crate::commands::http;
use serde::{Deserialize, Serialize};

pub async fn current(config: &CliConfig, ctx: &EffectiveContext) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    let hub_url = http::resolve_hub_url(config, ctx)?;
    let client = http::client();

    #[derive(Deserialize)]
    struct Release {
        release_id: String,
        r#ref: String,
        created_at: chrono::DateTime<chrono::Utc>,
    }

    let release: Release = http::send_json(
        http::with_auth(
            config,
            client.get(format!(
                "{}/api/releases/current?project={}&env={}",
                hub_url, project, env
            )),
        )?,
    )
    .await?;

    println!("Current release: {}", release.release_id);
    println!("Ref: {}", release.r#ref);
    println!("Created: {}", release.created_at);
    Ok(())
}

pub async fn list(config: &CliConfig, ctx: &EffectiveContext, limit: u32) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    let hub_url = http::resolve_hub_url(config, ctx)?;
    let client = http::client();

    #[derive(Deserialize)]
    struct Release {
        release_id: String,
        r#ref: String,
        created_at: chrono::DateTime<chrono::Utc>,
    }

    let releases: Vec<Release> = http::send_json(
        http::with_auth(
            config,
            client.get(format!(
                "{}/api/releases?project={}&env={}&limit={}",
                hub_url, project, env, limit
            )),
        )?,
    )
    .await?;

    if releases.is_empty() {
        println!("No releases.");
        return Ok(());
    }

    for rel in releases {
        println!("{} ref={} created={}", rel.release_id, rel.r#ref, rel.created_at);
    }
    Ok(())
}

pub async fn show(config: &CliConfig, release_id: &str) -> anyhow::Result<()> {
    let hub_url = config.hub_url()?;
    let client = http::client();

    #[derive(Deserialize)]
    struct Release {
        release_id: String,
        project: String,
        env: String,
        r#ref: String,
        created_at: chrono::DateTime<chrono::Utc>,
    }

    let rel: Release = http::send_json(
        http::with_auth(
            config,
            client.get(format!("{}/api/releases/{}", hub_url, release_id)),
        )?,
    )
    .await?;

    println!("Release: {}", rel.release_id);
    println!("Project/Env: {}/{}", rel.project, rel.env);
    println!("Ref: {}", rel.r#ref);
    println!("Created: {}", rel.created_at);
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

    let hub_url = http::resolve_hub_url(config, ctx)?;
    let client = http::client();

    #[derive(Serialize)]
    struct PromoteRequest {
        project: String,
        from: Option<String>,
        to: String,
        release_id: Option<String>,
    }

    let _resp: serde_json::Value = http::send_json(
        http::with_auth(config, client.post(format!("{}/api/releases/promote", hub_url)))?
            .json(&PromoteRequest {
                project: project.to_string(),
                from,
                to: to.to_string(),
                release_id,
            }),
    )
    .await?;

    println!("Release promoted to {}", to);
    Ok(())
}

pub async fn rollback(
    config: &CliConfig,
    ctx: &EffectiveContext,
    to_release_id: &str,
) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    let hub_url = http::resolve_hub_url(config, ctx)?;
    let client = http::client();

    #[derive(Serialize)]
    struct RollbackRequest {
        project: String,
        env: String,
        to_release_id: String,
    }

    let _resp: serde_json::Value = http::send_json(
        http::with_auth(config, client.post(format!("{}/api/releases/rollback", hub_url)))?
            .json(&RollbackRequest {
                project: project.to_string(),
                env: env.to_string(),
                to_release_id: to_release_id.to_string(),
            }),
    )
    .await?;

    println!("Rollback complete: {}", to_release_id);
    Ok(())
}
