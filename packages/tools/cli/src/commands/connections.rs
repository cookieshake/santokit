//! Connections 명령어

use crate::config::CliConfig;
use crate::context::EffectiveContext;
use crate::commands::http;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
struct Connection {
    name: String,
    engine: String,
    db_url: String,
    #[allow(dead_code)]
    created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn set(
    config: &CliConfig,
    ctx: &EffectiveContext,
    name: &str,
    engine: &str,
    db_url: &str,
) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    let hub_url = http::resolve_hub_url(config, ctx)?;
    let client = http::client();

    #[derive(Serialize)]
    struct SetConnectionRequest<'a> {
        project: &'a str,
        env: &'a str,
        name: &'a str,
        engine: &'a str,
        db_url: &'a str,
    }
    #[derive(Deserialize)]
    struct SetConnectionResponse {
        name: String,
        engine: String,
    }

    let conn: SetConnectionResponse = http::send_json(
        http::with_auth(config, client.post(format!("{}/api/connections", hub_url)))?
            .json(&SetConnectionRequest {
                project,
                env,
                name,
                engine,
                db_url,
            }),
    )
    .await?;

    println!("Connection set: {} ({})", conn.name, conn.engine);
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

    let hub_url = http::resolve_hub_url(config, ctx)?;
    let client = http::client();

    let resp: serde_json::Value = http::send_json(
        http::with_auth(
            config,
            client.post(format!(
                "{}/api/connections/{}/test?project={}&env={}",
                hub_url, conn_name, project, env
            )),
        )?,
    )
    .await?;

    if resp.get("ok").and_then(|v| v.as_bool()).unwrap_or(false) {
        println!("Connection test: ok");
    } else {
        println!("Connection test: failed");
    }
    Ok(())
}

pub async fn list(config: &CliConfig, ctx: &EffectiveContext) -> anyhow::Result<()> {
    let connections = fetch_connections(config, ctx).await?;

    if connections.is_empty() {
        println!("No connections.");
        return Ok(());
    }

    for conn in connections {
        println!(
            "{} ({}) {}",
            conn.name,
            conn.engine,
            mask_url(&conn.db_url)
        );
    }
    Ok(())
}

pub async fn show(config: &CliConfig, ctx: &EffectiveContext, name: Option<&str>) -> anyhow::Result<()> {
    let target = name
        .or(ctx.connection.as_deref())
        .unwrap_or("main");
    let connections = fetch_connections(config, ctx).await?;
    let conn = connections
        .into_iter()
        .find(|c| c.name == target)
        .ok_or_else(|| anyhow::anyhow!("Connection not found: {}", target))?;

    println!("name: {}", conn.name);
    println!("engine: {}", conn.engine);
    println!("db_url: {}", mask_url(&conn.db_url));
    Ok(())
}

pub async fn rotate(
    config: &CliConfig,
    ctx: &EffectiveContext,
    name: &str,
    db_url: &str,
) -> anyhow::Result<()> {
    let current = fetch_connections(config, ctx)
        .await?
        .into_iter()
        .find(|c| c.name == name)
        .ok_or_else(|| anyhow::anyhow!("Connection not found: {}", name))?;

    set(config, ctx, name, &current.engine, db_url).await?;
    println!("Connection rotated: {}", name);
    Ok(())
}

async fn fetch_connections(config: &CliConfig, ctx: &EffectiveContext) -> anyhow::Result<Vec<Connection>> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    let hub_url = http::resolve_hub_url(config, ctx)?;
    let client = http::client();

    http::send_json(
        http::with_auth(
            config,
            client.get(format!(
                "{}/api/connections?project={}&env={}",
                hub_url, project, env
            )),
        )?,
    )
    .await
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
