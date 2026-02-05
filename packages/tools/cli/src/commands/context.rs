//! 컨텍스트 명령어

use crate::context::RepoContext;

pub fn set(
    hub: Option<String>,
    project: Option<String>,
    env: Option<String>,
    connection: Option<String>,
) -> anyhow::Result<()> {
    let mut ctx = RepoContext::load().unwrap_or_default();

    if let Some(h) = hub {
        ctx.hub_url = Some(h);
    }
    if let Some(p) = project {
        ctx.project = Some(p);
    }
    if let Some(e) = env {
        ctx.env = Some(e);
    }
    if let Some(c) = connection {
        ctx.connection = Some(c);
    }

    ctx.save()?;
    println!("Context updated.");
    show()
}

pub fn show() -> anyhow::Result<()> {
    let ctx = RepoContext::load().unwrap_or_default();

    println!("Current context (.stk/context.json):");
    println!("  hub:        {}", ctx.hub_url.as_deref().unwrap_or("(not set)"));
    println!("  project:    {}", ctx.project.as_deref().unwrap_or("(not set)"));
    println!("  env:        {}", ctx.env.as_deref().unwrap_or("(not set)"));
    println!("  connection: {}", ctx.connection.as_deref().unwrap_or("(not set)"));

    Ok(())
}

pub fn clear() -> anyhow::Result<()> {
    RepoContext::clear()?;
    println!("Context cleared.");
    Ok(())
}
