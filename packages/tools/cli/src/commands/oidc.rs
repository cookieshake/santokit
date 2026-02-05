//! OIDC provider 관리

use crate::commands::http;
use crate::config::CliConfig;
use crate::context::EffectiveContext;
use serde::{Deserialize, Serialize};

pub async fn set_provider(
    config: &CliConfig,
    ctx: &EffectiveContext,
    name: &str,
    issuer: &str,
    auth_url: &str,
    token_url: &str,
    userinfo_url: Option<&str>,
    client_id: &str,
    client_secret: &str,
    redirect_uris: Vec<String>,
) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    let hub_url = http::resolve_hub_url(config, ctx)?;
    let client = http::client();

    #[derive(Serialize)]
    struct Req<'a> {
        project: &'a str,
        env: &'a str,
        name: &'a str,
        issuer: &'a str,
        auth_url: &'a str,
        token_url: &'a str,
        userinfo_url: Option<&'a str>,
        client_id: &'a str,
        client_secret: &'a str,
        redirect_uris: Vec<String>,
    }

    #[derive(Deserialize)]
    struct Resp {
        name: String,
        issuer: String,
        redirect_uris: Vec<String>,
    }

    let resp: Resp = http::send_json(
        http::with_auth(config, client.post(format!("{}/api/oidc/providers", hub_url)))?
            .json(&Req {
                project,
                env,
                name,
                issuer,
                auth_url,
                token_url,
                userinfo_url,
                client_id,
                client_secret,
                redirect_uris,
            }),
    )
    .await?;

    println!("OIDC provider saved: {} ({})", resp.name, resp.issuer);
    println!("Redirect URIs: {}", resp.redirect_uris.join(", "));
    Ok(())
}

pub async fn list_providers(config: &CliConfig, ctx: &EffectiveContext) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    let hub_url = http::resolve_hub_url(config, ctx)?;
    let client = http::client();

    #[derive(Deserialize)]
    struct Resp {
        name: String,
        issuer: String,
        redirect_uris: Vec<String>,
    }

    let list: Vec<Resp> = http::send_json(
        http::with_auth(
            config,
            client.get(format!("{}/api/oidc/providers?project={}&env={}", hub_url, project, env)),
        )?,
    )
    .await?;

    if list.is_empty() {
        println!("No OIDC providers configured.");
        return Ok(());
    }

    for item in list {
        println!("- {} ({})", item.name, item.issuer);
        if !item.redirect_uris.is_empty() {
            println!("  redirects: {}", item.redirect_uris.join(", "));
        }
    }

    Ok(())
}

pub async fn delete_provider(
    config: &CliConfig,
    ctx: &EffectiveContext,
    name: &str,
) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    let hub_url = http::resolve_hub_url(config, ctx)?;
    let client = http::client();

    http::send_json::<serde_json::Value>(
        http::with_auth(
            config,
            client.delete(format!(
                "{}/api/oidc/providers/{}?project={}&env={}",
                hub_url, name, project, env
            )),
        )?,
    )
    .await?;

    println!("OIDC provider deleted: {}", name);
    Ok(())
}
