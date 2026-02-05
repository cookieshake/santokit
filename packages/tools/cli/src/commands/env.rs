//! 환경 명령어

use crate::config::CliConfig;
use crate::context::EffectiveContext;
use crate::commands::http;
use serde::{Deserialize, Serialize};

pub async fn create(config: &CliConfig, ctx: &EffectiveContext, name: &str) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let hub_url = http::resolve_hub_url(config, ctx)?;
    let client = http::client();

    #[derive(Serialize)]
    struct CreateEnvRequest<'a> {
        name: &'a str,
    }
    #[derive(Deserialize)]
    struct Env {
        name: String,
    }

    let env: Env = http::send_json(
        http::with_auth(
            config,
            client.post(format!("{}/api/projects/{}/envs", hub_url, project)),
        )?
        .json(&CreateEnvRequest { name }),
    )
    .await?;

    println!("Created env: {}", env.name);
    Ok(())
}

pub async fn list(config: &CliConfig, ctx: &EffectiveContext) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let hub_url = http::resolve_hub_url(config, ctx)?;
    let client = http::client();

    #[derive(Deserialize)]
    struct Env {
        name: String,
        created_at: chrono::DateTime<chrono::Utc>,
    }

    let envs: Vec<Env> = http::send_json(
        http::with_auth(
            config,
            client.get(format!("{}/api/projects/{}/envs", hub_url, project)),
        )?,
    )
    .await?;

    if envs.is_empty() {
        println!("No envs.");
        return Ok(());
    }

    for env in envs {
        println!("{} (created {})", env.name, env.created_at);
    }
    Ok(())
}
