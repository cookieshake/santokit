//! Santokit CLI (`stk`)
//!
//! 웹 콘솔 없이 모든 운영을 수행하는 Operator 도구입니다.

use clap::{Parser, Subcommand};

mod commands;
mod config;
mod context;

use config::CliConfig;

#[derive(Parser)]
#[command(name = "stk")]
#[command(author, version, about = "Santokit CLI - Operator tool for Santokit", long_about = None)]
struct Cli {
    /// Hub URL (overrides context)
    #[arg(long, global = true)]
    hub: Option<String>,

    /// Project (overrides context)
    #[arg(long, global = true)]
    project: Option<String>,

    /// Environment (overrides context)
    #[arg(long, global = true)]
    env: Option<String>,

    /// Output format
    #[arg(long, global = true, default_value = "text")]
    format: OutputFormat,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Clone, Copy, Default, clap::ValueEnum)]
enum OutputFormat {
    #[default]
    Text,
    Json,
}

#[derive(Subcommand)]
enum Commands {
    // ─────────────────────────────────────────────────────────────────────────
    // Auth
    // ─────────────────────────────────────────────────────────────────────────
    /// Login to Hub
    Login,

    /// Logout from Hub
    Logout,

    /// Show current user
    Whoami,

    // ─────────────────────────────────────────────────────────────────────────
    // Context
    // ─────────────────────────────────────────────────────────────────────────
    /// Manage repo context
    Context {
        #[command(subcommand)]
        action: ContextAction,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Project & Env
    // ─────────────────────────────────────────────────────────────────────────
    /// Manage projects
    Project {
        #[command(subcommand)]
        action: ProjectAction,
    },

    /// Manage environments
    Env {
        #[command(subcommand)]
        action: EnvAction,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Connections
    // ─────────────────────────────────────────────────────────────────────────
    /// Manage database connections
    Connections {
        #[command(subcommand)]
        action: ConnectionsAction,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // API Keys
    // ─────────────────────────────────────────────────────────────────────────
    /// Manage API keys
    Apikey {
        #[command(subcommand)]
        action: ApikeyAction,
    },

    // ─────────────────────────────────────────────────────────────────────────
    // Apply & Release
    // ─────────────────────────────────────────────────────────────────────────
    /// Apply schema, permissions, and create release
    Apply {
        /// Git ref (commit SHA recommended)
        #[arg(long)]
        r#ref: String,

        /// Only apply specific parts (comma-separated: schema,permissions,release)
        #[arg(long)]
        only: Option<String>,

        /// Dry run (plan only, no changes)
        #[arg(long)]
        dry_run: bool,

        /// Allow destructive schema changes
        #[arg(long)]
        force: bool,
    },

    /// Manage releases
    Release {
        #[command(subcommand)]
        action: ReleaseAction,
    },

    /// Manage schema
    Schema {
        #[command(subcommand)]
        action: SchemaAction,
    },

    /// Manage OIDC providers
    Oidc {
        #[command(subcommand)]
        action: OidcAction,
    },

    /// Manage operators
    Operators {
        #[command(subcommand)]
        action: OperatorAction,
    },

    /// Query audit logs
    Audit {
        #[command(subcommand)]
        action: AuditAction,
    },
}

// ─────────────────────────────────────────────────────────────────────────────
// Subcommand enums
// ─────────────────────────────────────────────────────────────────────────────

#[derive(Subcommand)]
enum ContextAction {
    /// Set repo context
    Set {
        #[arg(long)]
        hub: Option<String>,
        #[arg(long)]
        project: Option<String>,
        #[arg(long)]
        env: Option<String>,
        #[arg(long)]
        connection: Option<String>,
    },
    /// Show current context
    Show,
    /// Clear context
    Clear,
}

#[derive(Subcommand)]
enum ProjectAction {
    /// Create a new project
    Create { name: String },
    /// List projects
    List,
    /// Add operator to project
    AddOperator {
        #[arg(long)]
        email: String,
        #[arg(long, default_value = "member")]
        role: String,
    },
}

#[derive(Subcommand)]
enum EnvAction {
    /// Create a new environment
    Create { name: String },
    /// List environments
    List,
}

#[derive(Subcommand)]
enum ConnectionsAction {
    /// Set connection config
    Set {
        #[arg(long)]
        name: String,
        #[arg(long)]
        engine: String,
        #[arg(long)]
        db_url: String,
    },
    /// Test connection
    Test {
        #[arg(long)]
        name: Option<String>,
    },
    /// List connections
    List,
    /// Show connection details
    Show {
        #[arg(long)]
        name: Option<String>,
    },
    /// Rotate connection credentials
    Rotate {
        #[arg(long)]
        name: String,
        #[arg(long)]
        db_url: String,
    },
}

#[derive(Subcommand)]
enum ApikeyAction {
    /// Create a new API key
    Create {
        #[arg(long)]
        name: String,
        #[arg(long)]
        roles: String,
    },
    /// List API keys
    List,
    /// Revoke an API key
    Revoke {
        #[arg(long)]
        key_id: String,
    },
}

#[derive(Subcommand)]
enum ReleaseAction {
    /// Show current release
    Current,
    /// List releases
    List {
        #[arg(long, default_value = "10")]
        limit: u32,
    },
    /// Show release details
    Show {
        #[arg(long)]
        release_id: String,
    },
    /// Promote release
    Promote {
        #[arg(long)]
        from: Option<String>,
        #[arg(long)]
        to: String,
        #[arg(long)]
        release_id: Option<String>,
    },
    /// Rollback release
    Rollback {
        #[arg(long)]
        to: String,
    },
}

#[derive(Subcommand)]
enum SchemaAction {
    /// Take schema snapshot for drift detection
    Snapshot,
    /// Check schema drift against latest snapshot
    Drift,
}

#[derive(Subcommand)]
enum OidcAction {
    /// Manage OIDC providers
    Provider {
        #[command(subcommand)]
        action: OidcProviderAction,
    },
    /// Create or update an OIDC provider
    #[command(hide = true)]
    ProviderSet {
        #[arg(long)]
        name: String,
        #[arg(long)]
        issuer: String,
        #[arg(long)]
        auth_url: String,
        #[arg(long)]
        token_url: String,
        #[arg(long)]
        userinfo_url: Option<String>,
        #[arg(long)]
        client_id: String,
        #[arg(long)]
        client_secret: String,
        #[arg(long)]
        redirect_uri: Vec<String>,
    },
    /// List OIDC providers
    #[command(hide = true)]
    ProviderList,
    /// Delete an OIDC provider
    #[command(hide = true)]
    ProviderDelete {
        #[arg(long)]
        name: String,
    },
}

#[derive(Subcommand)]
enum OidcProviderAction {
    /// Create or update an OIDC provider
    Set {
        #[arg(long)]
        name: String,
        #[arg(long)]
        issuer: String,
        #[arg(long)]
        auth_url: String,
        #[arg(long)]
        token_url: String,
        #[arg(long)]
        userinfo_url: Option<String>,
        #[arg(long)]
        client_id: String,
        #[arg(long)]
        client_secret: String,
        #[arg(long)]
        redirect_uri: Vec<String>,
    },
    /// List OIDC providers
    List,
    /// Delete an OIDC provider
    Delete {
        #[arg(long)]
        name: String,
    },
}

#[derive(Subcommand)]
enum OperatorAction {
    /// List operators
    List,
    /// Invite or reset an operator
    Invite {
        #[arg(long)]
        email: String,
        #[arg(long)]
        roles: String,
    },
    /// Update operator roles
    UpdateRoles {
        #[arg(long)]
        id: String,
        #[arg(long)]
        roles: String,
    },
    /// Update operator status
    UpdateStatus {
        #[arg(long)]
        id: String,
        #[arg(long)]
        status: String,
    },
}

#[derive(Subcommand)]
enum AuditAction {
    /// List audit logs
    Logs {
        #[arg(long)]
        project: Option<String>,
        #[arg(long)]
        env: Option<String>,
        #[arg(long)]
        operator_id: Option<String>,
        #[arg(long)]
        action: Option<String>,
        #[arg(long)]
        resource_type: Option<String>,
        #[arg(long, default_value = "100")]
        limit: u32,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    let cli = Cli::parse();

    // 설정 로드
    let config = CliConfig::load()?;

    // 컨텍스트 결정 (CLI 옵션 > repo context)
    let effective_context = context::resolve_context(
        cli.hub.as_deref(),
        cli.project.as_deref(),
        cli.env.as_deref(),
    )?;

    // 명령 실행
    match cli.command {
        Commands::Login => commands::auth::login(&config).await,
        Commands::Logout => commands::auth::logout(&config).await,
        Commands::Whoami => commands::auth::whoami(&config).await,

        Commands::Context { action } => match action {
            ContextAction::Set { hub, project, env, connection } => {
                commands::context::set(hub, project, env, connection)
            }
            ContextAction::Show => commands::context::show(),
            ContextAction::Clear => commands::context::clear(),
        },

        Commands::Project { action } => match action {
            ProjectAction::Create { name } => {
                commands::project::create(&config, &name).await
            }
            ProjectAction::List => commands::project::list(&config).await,
            ProjectAction::AddOperator { email, role } => {
                commands::project::add_operator(&config, &effective_context, &email, &role).await
            }
        },

        Commands::Env { action } => match action {
            EnvAction::Create { name } => {
                commands::env::create(&config, &effective_context, &name).await
            }
            EnvAction::List => commands::env::list(&config, &effective_context).await,
        },

        Commands::Connections { action } => match action {
            ConnectionsAction::Set { name, engine, db_url } => {
                commands::connections::set(&config, &effective_context, &name, &engine, &db_url).await
            }
            ConnectionsAction::Test { name } => {
                commands::connections::test(&config, &effective_context, name.as_deref()).await
            }
            ConnectionsAction::List => {
                commands::connections::list(&config, &effective_context).await
            }
            ConnectionsAction::Show { name } => {
                commands::connections::show(&config, &effective_context, name.as_deref()).await
            }
            ConnectionsAction::Rotate { name, db_url } => {
                commands::connections::rotate(&config, &effective_context, &name, &db_url).await
            }
        },

        Commands::Apikey { action } => match action {
            ApikeyAction::Create { name, roles } => {
                commands::apikey::create(&config, &effective_context, &name, &roles).await
            }
            ApikeyAction::List => commands::apikey::list(&config, &effective_context).await,
            ApikeyAction::Revoke { key_id } => {
                commands::apikey::revoke(&config, &effective_context, &key_id).await
            }
        },

        Commands::Apply { r#ref, only, dry_run, force } => {
            commands::apply::apply(&config, &effective_context, &r#ref, only, dry_run, force).await
        }

        Commands::Release { action } => match action {
            ReleaseAction::Current => {
                commands::release::current(&config, &effective_context).await
            }
            ReleaseAction::List { limit } => {
                commands::release::list(&config, &effective_context, limit).await
            }
            ReleaseAction::Show { release_id } => {
                commands::release::show(&config, &release_id).await
            }
            ReleaseAction::Promote { from, to, release_id } => {
                commands::release::promote(&config, &effective_context, from, &to, release_id).await
            }
            ReleaseAction::Rollback { to } => {
                commands::release::rollback(&config, &effective_context, &to).await
            }
        },

        Commands::Schema { action } => match action {
            SchemaAction::Snapshot => commands::schema::snapshot(&config, &effective_context).await,
            SchemaAction::Drift => commands::schema::drift(&config, &effective_context).await,
        },

        Commands::Oidc { action } => match action {
            OidcAction::Provider { action } => match action {
                OidcProviderAction::Set {
                    name,
                    issuer,
                    auth_url,
                    token_url,
                    userinfo_url,
                    client_id,
                    client_secret,
                    redirect_uri,
                } => {
                    commands::oidc::set_provider(
                        &config,
                        &effective_context,
                        &name,
                        &issuer,
                        &auth_url,
                        &token_url,
                        userinfo_url.as_deref(),
                        &client_id,
                        &client_secret,
                        redirect_uri,
                    )
                    .await
                }
                OidcProviderAction::List => {
                    commands::oidc::list_providers(&config, &effective_context).await
                }
                OidcProviderAction::Delete { name } => {
                    commands::oidc::delete_provider(&config, &effective_context, &name).await
                }
            },
            OidcAction::ProviderSet {
                name,
                issuer,
                auth_url,
                token_url,
                userinfo_url,
                client_id,
                client_secret,
                redirect_uri,
            } => {
                commands::oidc::set_provider(
                    &config,
                    &effective_context,
                    &name,
                    &issuer,
                    &auth_url,
                    &token_url,
                    userinfo_url.as_deref(),
                    &client_id,
                    &client_secret,
                    redirect_uri,
                )
                .await
            }
            OidcAction::ProviderList => {
                commands::oidc::list_providers(&config, &effective_context).await
            }
            OidcAction::ProviderDelete { name } => {
                commands::oidc::delete_provider(&config, &effective_context, &name).await
            }
        },
        Commands::Operators { action } => match action {
            OperatorAction::List => commands::operators::list(&config).await,
            OperatorAction::Invite { email, roles } => {
                commands::operators::invite(&config, &email, &roles).await
            }
            OperatorAction::UpdateRoles { id, roles } => {
                commands::operators::update_roles(&config, &id, &roles).await
            }
            OperatorAction::UpdateStatus { id, status } => {
                commands::operators::update_status(&config, &id, &status).await
            }
        },
        Commands::Audit { action } => match action {
            AuditAction::Logs {
                project,
                env,
                operator_id,
                action,
                resource_type,
                limit,
            } => {
                commands::audit::logs(
                    &config,
                    &effective_context,
                    project,
                    env,
                    operator_id,
                    action,
                    resource_type,
                    limit,
                )
                .await
            }
        },
    }
}
