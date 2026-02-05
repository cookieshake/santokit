//! Operator 관리

use crate::commands::http;
use crate::config::CliConfig;
use serde::{Deserialize, Serialize};

fn parse_roles(input: &str) -> Vec<String> {
    input
        .split(',')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
        .collect()
}

pub async fn list(config: &CliConfig) -> anyhow::Result<()> {
    let hub_url = config.hub_url()?;
    let client = http::client();

    #[derive(Deserialize)]
    struct Operator {
        id: String,
        email: String,
        roles: Vec<String>,
        status: String,
        created_at: String,
    }

    let list: Vec<Operator> = http::send_json(
        http::with_auth(config, client.get(format!("{}/api/operators", hub_url)))?,
    )
    .await?;

    if list.is_empty() {
        println!("No operators.");
        return Ok(());
    }

    for op in list {
        println!("- {} ({}) {} {}", op.id, op.email, op.status, op.created_at);
        if !op.roles.is_empty() {
            println!("  roles: {}", op.roles.join(", "));
        }
    }

    Ok(())
}

pub async fn invite(config: &CliConfig, email: &str, roles: &str) -> anyhow::Result<()> {
    let hub_url = config.hub_url()?;
    let client = http::client();

    #[derive(Serialize)]
    struct Req<'a> {
        email: &'a str,
        roles: Vec<String>,
    }

    #[derive(Deserialize)]
    struct Resp {
        id: String,
        email: String,
        roles: Vec<String>,
        status: String,
        temp_password: String,
    }

    let resp: Resp = http::send_json(
        http::with_auth(config, client.post(format!("{}/api/operators/invite", hub_url)))?
            .json(&Req {
                email,
                roles: parse_roles(roles),
            }),
    )
    .await?;

    println!("Invited operator: {} ({})", resp.id, resp.email);
    println!("Status: {}", resp.status);
    println!("Roles: {}", resp.roles.join(", "));
    println!("Temp password: {}", resp.temp_password);
    Ok(())
}

pub async fn update_roles(config: &CliConfig, id: &str, roles: &str) -> anyhow::Result<()> {
    let hub_url = config.hub_url()?;
    let client = http::client();

    #[derive(Serialize)]
    struct Req {
        roles: Vec<String>,
    }

    http::send_json::<serde_json::Value>(
        http::with_auth(
            config,
            client
                .post(format!("{}/api/operators/{}/roles", hub_url, id))
                .json(&Req {
                    roles: parse_roles(roles),
                }),
        )?,
    )
    .await?;

    println!("Updated roles for operator {}", id);
    Ok(())
}

pub async fn update_status(config: &CliConfig, id: &str, status: &str) -> anyhow::Result<()> {
    let hub_url = config.hub_url()?;
    let client = http::client();

    #[derive(Serialize)]
    struct Req<'a> {
        status: &'a str,
    }

    http::send_json::<serde_json::Value>(
        http::with_auth(
            config,
            client
                .post(format!("{}/api/operators/{}/status", hub_url, id))
                .json(&Req { status }),
        )?,
    )
    .await?;

    println!("Updated status for operator {}", id);
    Ok(())
}
