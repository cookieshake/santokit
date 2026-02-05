//! Schema 관련 명령어

use crate::commands::http;
use crate::config::CliConfig;
use crate::context::EffectiveContext;
use serde::Deserialize;

pub async fn snapshot(config: &CliConfig, ctx: &EffectiveContext) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    let hub_url = http::resolve_hub_url(config, ctx)?;
    let client = http::client();

    #[derive(Deserialize)]
    struct Resp {
        project: String,
        env: String,
        snapshots: Vec<Snapshot>,
    }

    #[derive(Deserialize)]
    struct Snapshot {
        connection: String,
        snapshot: SnapshotBody,
    }

    #[derive(Deserialize)]
    struct SnapshotBody {
        tables: Vec<SnapshotTable>,
    }

    #[derive(Deserialize)]
    struct SnapshotTable {
        name: String,
        columns: Vec<SnapshotColumn>,
    }

    #[derive(Deserialize)]
    #[allow(dead_code)]
    struct SnapshotColumn {
        name: String,
        data_type: String,
        nullable: bool,
    }

    let resp: Resp = http::send_json(
        http::with_auth(config, client.post(format!("{}/api/schema/snapshot", hub_url)))?
            .json(&serde_json::json!({ "project": project, "env": env })),
    )
    .await?;

    println!("Schema snapshot saved for {}/{}", resp.project, resp.env);
    for snap in resp.snapshots {
        println!("- {}: {} tables", snap.connection, snap.snapshot.tables.len());
        for table in snap.snapshot.tables {
            println!("  - {} ({} columns)", table.name, table.columns.len());
        }
    }

    Ok(())
}

pub async fn drift(config: &CliConfig, ctx: &EffectiveContext) -> anyhow::Result<()> {
    let project = ctx.require_project()?;
    let env = ctx.require_env()?;

    let hub_url = http::resolve_hub_url(config, ctx)?;
    let client = http::client();

    #[derive(Deserialize)]
    struct Resp {
        project: String,
        env: String,
        drift: Vec<DriftEntry>,
    }

    #[derive(Deserialize)]
    struct DriftEntry {
        connection: String,
        issues: Vec<String>,
    }

    let resp: Resp = http::send_json(
        http::with_auth(config, client.post(format!("{}/api/schema/drift", hub_url)))?
            .json(&serde_json::json!({ "project": project, "env": env })),
    )
    .await?;

    println!("Schema drift for {}/{}", resp.project, resp.env);
    for entry in resp.drift {
        if entry.issues.is_empty() {
            println!("- {}: no drift", entry.connection);
        } else {
            println!("- {}: {}", entry.connection, entry.issues.join(", "));
        }
    }

    Ok(())
}
