//! API Key 명령어

use crate::config::CliConfig;
use crate::context::EffectiveContext;
use crate::commands::http;
use serde::{Deserialize, Serialize};

pub async fn create(
    config: &CliConfig,
    ctx: &EffectiveContext,
    name: &str,
    roles: &str,
) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    let hub_url = http::resolve_hub_url(config, ctx)?;
    let client = http::client();

    let role_list: Vec<String> = roles
        .split(',')
        .map(|r| r.trim().to_string())
        .filter(|r| !r.is_empty())
        .collect();

    #[derive(Serialize)]
    struct CreateRequest<'a> {
        project: &'a str,
        env: &'a str,
        name: &'a str,
        roles: Vec<String>,
    }

    #[derive(Deserialize)]
    struct CreateResponse {
        key_id: String,
        api_key: String,
        roles: Vec<String>,
    }

    let resp: CreateResponse = http::send_json(
        http::with_auth(config, client.post(format!("{}/api/apikeys", hub_url)))?
            .json(&CreateRequest {
                project,
                env,
                name,
                roles: role_list,
            }),
    )
    .await?;

    println!("Key ID: {}", resp.key_id);
    println!("API Key (store securely): {}", resp.api_key);
    println!("Roles: {}", resp.roles.join(", "));
    Ok(())
}

pub async fn list(config: &CliConfig, ctx: &EffectiveContext) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    let hub_url = http::resolve_hub_url(config, ctx)?;
    let client = http::client();

    #[derive(Deserialize)]
    struct ApiKey {
        id: stk_core::auth::ApiKeyId,
        name: String,
        roles: Vec<String>,
        status: stk_core::auth::ApiKeyStatus,
        created_at: chrono::DateTime<chrono::Utc>,
        last_used_at: Option<chrono::DateTime<chrono::Utc>>,
    }

    let keys: Vec<ApiKey> = http::send_json(
        http::with_auth(
            config,
            client.get(format!(
                "{}/api/apikeys?project={}&env={}",
                hub_url, project, env
            )),
        )?,
    )
    .await?;

    if keys.is_empty() {
        println!("No API keys.");
        return Ok(());
    }

    for key in keys {
        println!(
            "{} ({}) roles={} status={:?} created={} last_used={}",
            key.id.0,
            key.name,
            key.roles.join(","),
            key.status,
            key.created_at,
            key.last_used_at
                .map(|d| d.to_string())
                .unwrap_or_else(|| "-".to_string())
        );
    }
    Ok(())
}

pub async fn revoke(
    config: &CliConfig,
    ctx: &EffectiveContext,
    key_id: &str,
) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    let hub_url = http::resolve_hub_url(config, ctx)?;
    let client = http::client();

    let _resp: serde_json::Value = http::send_json(
        http::with_auth(
            config,
            client.delete(format!(
                "{}/api/apikeys/{}?project={}&env={}",
                hub_url, key_id, project, env
            )),
        )?,
    )
    .await?;

    println!("API key revoked: {}", key_id);
    Ok(())
}
