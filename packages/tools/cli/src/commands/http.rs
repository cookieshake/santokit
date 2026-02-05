use anyhow::Context as _;
use reqwest::{Client, RequestBuilder};
use serde::de::DeserializeOwned;

use crate::config::CliConfig;
use crate::context::EffectiveContext;

pub fn resolve_hub_url(config: &CliConfig, ctx: &EffectiveContext) -> anyhow::Result<String> {
    if let Some(url) = &ctx.hub_url {
        Ok(url.clone())
    } else {
        config.hub_url()
    }
}

pub fn auth_token(config: &CliConfig) -> anyhow::Result<String> {
    config.get_auth_token()
}

pub fn client() -> Client {
    Client::new()
}

pub fn with_auth(config: &CliConfig, req: RequestBuilder) -> anyhow::Result<RequestBuilder> {
    let token = auth_token(config)?;
    Ok(req.bearer_auth(token))
}

pub async fn send_json<T: DeserializeOwned>(req: RequestBuilder) -> anyhow::Result<T> {
    let resp = req.send().await.context("request failed")?;
    let status = resp.status();
    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(anyhow::anyhow!("request failed ({}): {}", status, text));
    }
    let body = resp.json::<T>().await.context("invalid json response")?;
    Ok(body)
}
