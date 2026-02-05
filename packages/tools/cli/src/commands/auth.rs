//! 인증 명령어

use crate::config::CliConfig;
use crate::commands::http;
use inquire::{Password, Text};
use serde::{Deserialize, Serialize};

pub async fn login(config: &CliConfig) -> anyhow::Result<()> {
    let email = Text::new("Email").prompt()?;
    let password = Password::new("Password").without_confirmation().prompt()?;

    let hub_url = config.hub_url()?;
    let client = http::client();

    #[derive(Serialize)]
    struct LoginRequest {
        email: String,
        password: String,
    }
    #[derive(Deserialize)]
    struct LoginResponse {
        token: String,
        email: String,
        roles: Vec<String>,
    }

    let resp: LoginResponse = http::send_json(
        client
            .post(format!("{}/api/auth/login", hub_url))
            .json(&LoginRequest { email, password }),
    )
    .await?;

    let mut config = config.clone();
    config.auth_token = Some(resp.token);
    config.save()?;

    println!("Logged in as {}", resp.email);
    println!("Roles: {}", resp.roles.join(", "));
    Ok(())
}

pub async fn logout(config: &CliConfig) -> anyhow::Result<()> {
    let hub_url = config.hub_url().ok();
    let token = config.get_auth_token().ok();

    if let (Some(hub_url), Some(token)) = (hub_url, token) {
        let client = http::client();
        let _ = http::send_json::<serde_json::Value>(
            client
                .post(format!("{}/api/auth/logout", hub_url))
                .bearer_auth(token),
        )
        .await;
    }

    let mut config = config.clone();
    config.auth_token = None;
    config.save()?;
    println!("Logged out.");
    Ok(())
}

pub async fn whoami(config: &CliConfig) -> anyhow::Result<()> {
    let hub_url = config.hub_url()?;
    let client = http::client();

    #[derive(Deserialize)]
    struct MeResponse {
        email: String,
        roles: Vec<String>,
    }

    let resp: MeResponse = http::send_json(
        http::with_auth(config, client.get(format!("{}/api/auth/me", hub_url)))?,
    )
    .await?;

    println!("Email: {}", resp.email);
    println!("Roles: {}", resp.roles.join(", "));
    Ok(())
}
