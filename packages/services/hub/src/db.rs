use std::collections::HashMap;
use std::hash::{Hash, Hasher};

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::{sqlite::SqlitePoolOptions, Row, SqlitePool};

use stk_core::auth::{ApiKey, ApiKeyId, ApiKeyStatus};
use stk_core::permissions::PermissionPolicy;
use stk_core::schema::ProjectSchema;
use stk_core::storage::StorageConfig;

use crate::crypto::{decrypt_string, encrypt_string};

#[derive(Clone)]
pub struct HubDb {
    pool: SqlitePool,
    secret_key: [u8; 32],
}

impl HubDb {
    pub async fn new(db_url: &str, secret_key: [u8; 32]) -> anyhow::Result<Self> {
        let pool = SqlitePoolOptions::new()
            .max_connections(5)
            .connect(db_url)
            .await?;

        let db = Self { pool, secret_key };
        db.init().await?;
        Ok(db)
    }

    async fn init(&self) -> anyhow::Result<()> {
        let queries = [
            r#"CREATE TABLE IF NOT EXISTS operators (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL,
                roles TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TEXT NOT NULL
            );"#,
            r#"CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                operator_id TEXT NOT NULL,
                created_at TEXT NOT NULL
            );"#,
            r#"CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            );"#,
            r#"CREATE TABLE IF NOT EXISTS orgs (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                created_at TEXT NOT NULL
            );"#,
            r#"CREATE TABLE IF NOT EXISTS teams (
                id TEXT PRIMARY KEY,
                org_id TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(org_id, name)
            );"#,
            r#"CREATE TABLE IF NOT EXISTS operator_memberships (
                operator_id TEXT NOT NULL,
                team_id TEXT NOT NULL,
                role TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (operator_id, team_id)
            );"#,
            r#"CREATE TABLE IF NOT EXISTS project_teams (
                project_id TEXT NOT NULL,
                team_id TEXT NOT NULL,
                PRIMARY KEY (project_id, team_id)
            );"#,
            r#"CREATE TABLE IF NOT EXISTS envs (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(project_id, name)
            );"#,
            r#"CREATE TABLE IF NOT EXISTS connections (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                env_id TEXT NOT NULL,
                name TEXT NOT NULL,
                engine TEXT NOT NULL,
                db_url_enc TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(project_id, env_id, name)
            );"#,
            r#"CREATE TABLE IF NOT EXISTS api_keys (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                env_id TEXT NOT NULL,
                name TEXT NOT NULL,
                roles TEXT NOT NULL,
                status TEXT NOT NULL,
                secret_hash TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_used_at TEXT
            );"#,
            r#"CREATE TABLE IF NOT EXISTS releases (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                env_id TEXT NOT NULL,
                ref TEXT NOT NULL,
                schema_json TEXT NOT NULL,
                permissions_yaml TEXT NOT NULL,
                storage_yaml TEXT NOT NULL,
                logics_json TEXT NOT NULL DEFAULT '{}',
                created_at TEXT NOT NULL,
                snapshot_hash TEXT NOT NULL
            );"#,
            r#"CREATE TABLE IF NOT EXISTS env_current (
                project_id TEXT NOT NULL,
                env_id TEXT NOT NULL,
                release_id TEXT NOT NULL,
                PRIMARY KEY (project_id, env_id)
            );"#,
            r#"CREATE TABLE IF NOT EXISTS end_users (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                env_id TEXT NOT NULL,
                email TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                roles TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(project_id, env_id, email)
            );"#,
            r#"CREATE TABLE IF NOT EXISTS refresh_tokens (
                id TEXT PRIMARY KEY,
                end_user_id TEXT NOT NULL,
                project_id TEXT NOT NULL,
                env_id TEXT NOT NULL,
                token_hash TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                revoked_at TEXT,
                created_at TEXT NOT NULL
            );"#,
            r#"CREATE TABLE IF NOT EXISTS end_user_identities (
                id TEXT PRIMARY KEY,
                end_user_id TEXT NOT NULL,
                project_id TEXT NOT NULL,
                env_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                subject TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(project_id, env_id, provider, subject)
            );"#,
            r#"CREATE TABLE IF NOT EXISTS audit_logs (
                id TEXT PRIMARY KEY,
                operator_id TEXT NOT NULL,
                action TEXT NOT NULL,
                resource_type TEXT NOT NULL,
                resource_id TEXT,
                project_id TEXT,
                env_id TEXT,
                metadata_json TEXT,
                created_at TEXT NOT NULL
            );"#,
            r#"CREATE TABLE IF NOT EXISTS schema_snapshots (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                env_id TEXT NOT NULL,
                connection_name TEXT NOT NULL,
                snapshot_json TEXT NOT NULL,
                created_at TEXT NOT NULL
            );"#,
            r#"CREATE TABLE IF NOT EXISTS oidc_providers (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                env_id TEXT NOT NULL,
                name TEXT NOT NULL,
                issuer TEXT NOT NULL,
                auth_url TEXT NOT NULL,
                token_url TEXT NOT NULL,
                userinfo_url TEXT,
                client_id TEXT NOT NULL,
                client_secret TEXT NOT NULL,
                redirect_uris_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                UNIQUE(project_id, env_id, name)
            );"#,
            r#"CREATE TABLE IF NOT EXISTS oidc_sessions (
                state TEXT PRIMARY KEY,
                project_id TEXT NOT NULL,
                env_id TEXT NOT NULL,
                provider TEXT NOT NULL,
                redirect_uri TEXT NOT NULL,
                created_at TEXT NOT NULL
            );"#,
        ];

        for q in queries {
            sqlx::query(q).execute(&self.pool).await?;
        }
        self.ensure_column("releases", "logics_json", "TEXT NOT NULL DEFAULT '{}'").await?;
        self.ensure_column("operators", "status", "TEXT NOT NULL DEFAULT 'active'").await?;
        self.ensure_column("audit_logs", "project_id", "TEXT").await?;
        self.ensure_column("audit_logs", "env_id", "TEXT").await?;

        Ok(())
    }

    async fn ensure_column(&self, table: &str, column: &str, ddl: &str) -> anyhow::Result<()> {
        let rows = sqlx::query(&format!("PRAGMA table_info({})", table))
            .fetch_all(&self.pool)
            .await?;
        let exists = rows
            .iter()
            .any(|row| row.try_get::<String, _>("name").ok().as_deref() == Some(column));
        if !exists {
            let sql = format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, ddl);
            sqlx::query(&sql).execute(&self.pool).await?;
        }
        Ok(())
    }

    pub async fn upsert_operator(
        &self,
        email: &str,
        password_hash: &str,
        roles: &[String],
    ) -> anyhow::Result<OperatorRow> {
        let id = ulid::Ulid::new().to_string();
        let roles_json = serde_json::to_string(roles)?;
        let created_at = Utc::now().to_rfc3339();

        sqlx::query(
            r#"INSERT INTO operators (id, email, password_hash, roles, status, created_at)
               VALUES (?1, ?2, ?3, ?4, 'active', ?5)
               ON CONFLICT(email) DO UPDATE SET password_hash=excluded.password_hash, roles=excluded.roles"#,
        )
        .bind(&id)
        .bind(email)
        .bind(password_hash)
        .bind(roles_json)
        .bind(&created_at)
        .execute(&self.pool)
        .await?;

        self.get_operator_by_email(email).await
            .map(|opt| opt.ok_or_else(|| anyhow::anyhow!("operator missing")))?
    }

    pub async fn get_operator_by_email(&self, email: &str) -> anyhow::Result<Option<OperatorRow>> {
        let row = sqlx::query_as::<_, OperatorRow>(
            r#"SELECT id, email, password_hash, roles, status, created_at FROM operators WHERE email = ?1"#,
        )
        .bind(email)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    pub async fn list_operators(&self) -> anyhow::Result<Vec<OperatorRow>> {
        let rows = sqlx::query_as::<_, OperatorRow>(
            r#"SELECT id, email, password_hash, roles, status, created_at FROM operators ORDER BY created_at ASC"#,
        )
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn update_operator_roles(
        &self,
        operator_id: &str,
        roles: &[String],
    ) -> anyhow::Result<()> {
        let roles_json = serde_json::to_string(roles)?;
        sqlx::query(r#"UPDATE operators SET roles = ?1 WHERE id = ?2"#)
            .bind(roles_json)
            .bind(operator_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn update_operator_status(
        &self,
        operator_id: &str,
        status: &str,
    ) -> anyhow::Result<()> {
        sqlx::query(r#"UPDATE operators SET status = ?1 WHERE id = ?2"#)
            .bind(status)
            .bind(operator_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn ensure_default_team(&self, operator_id: &str) -> anyhow::Result<String> {
        if let Some(team_id) = self.get_operator_team_id(operator_id).await? {
            return Ok(team_id);
        }

        let org_id = self.get_or_create_org("default").await?;
        let team_id = self.get_or_create_team(&org_id, "default").await?;

        sqlx::query(
            r#"INSERT OR IGNORE INTO operator_memberships (operator_id, team_id, role, created_at)
               VALUES (?1, ?2, ?3, ?4)"#,
        )
        .bind(operator_id)
        .bind(&team_id)
        .bind("owner")
        .bind(Utc::now().to_rfc3339())
        .execute(&self.pool)
        .await?;

        Ok(team_id)
    }

    async fn get_or_create_org(&self, name: &str) -> anyhow::Result<String> {
        if let Some(row) = sqlx::query_as::<_, OrgRow>(
            r#"SELECT id, name, created_at FROM orgs WHERE name = ?1"#,
        )
        .bind(name)
        .fetch_optional(&self.pool)
        .await?
        {
            return Ok(row.id);
        }

        let id = ulid::Ulid::new().to_string();
        sqlx::query(r#"INSERT INTO orgs (id, name, created_at) VALUES (?1, ?2, ?3)"#)
            .bind(&id)
            .bind(name)
            .bind(Utc::now().to_rfc3339())
            .execute(&self.pool)
            .await?;
        Ok(id)
    }

    async fn get_or_create_team(&self, org_id: &str, name: &str) -> anyhow::Result<String> {
        if let Some(row) = sqlx::query_as::<_, TeamRow>(
            r#"SELECT id, org_id, name, created_at FROM teams WHERE org_id = ?1 AND name = ?2"#,
        )
        .bind(org_id)
        .bind(name)
        .fetch_optional(&self.pool)
        .await?
        {
            return Ok(row.id);
        }

        let id = ulid::Ulid::new().to_string();
        sqlx::query(r#"INSERT INTO teams (id, org_id, name, created_at) VALUES (?1, ?2, ?3, ?4)"#)
            .bind(&id)
            .bind(org_id)
            .bind(name)
            .bind(Utc::now().to_rfc3339())
            .execute(&self.pool)
            .await?;
        Ok(id)
    }

    pub async fn get_operator_team_id(&self, operator_id: &str) -> anyhow::Result<Option<String>> {
        let row: Option<(String,)> = sqlx::query_as(
            r#"SELECT team_id FROM operator_memberships WHERE operator_id = ?1 LIMIT 1"#,
        )
        .bind(operator_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| r.0))
    }

    pub async fn get_project_team_id(&self, project_id: &str) -> anyhow::Result<Option<String>> {
        let row: Option<(String,)> = sqlx::query_as(
            r#"SELECT team_id FROM project_teams WHERE project_id = ?1 LIMIT 1"#,
        )
        .bind(project_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| r.0))
    }

    pub async fn add_project_team(&self, project_id: &str, team_id: &str) -> anyhow::Result<()> {
        sqlx::query(r#"INSERT OR IGNORE INTO project_teams (project_id, team_id) VALUES (?1, ?2)"#)
            .bind(project_id)
            .bind(team_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn add_operator_membership(
        &self,
        operator_id: &str,
        team_id: &str,
        role: &str,
    ) -> anyhow::Result<()> {
        sqlx::query(
            r#"INSERT INTO operator_memberships (operator_id, team_id, role, created_at)
               VALUES (?1, ?2, ?3, ?4)
               ON CONFLICT(operator_id, team_id) DO UPDATE SET role=excluded.role"#,
        )
        .bind(operator_id)
        .bind(team_id)
        .bind(role)
        .bind(Utc::now().to_rfc3339())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn operator_role_for_project(
        &self,
        operator_id: &str,
        project_id: &str,
    ) -> anyhow::Result<Option<String>> {
        let row: Option<(String,)> = sqlx::query_as(
            r#"SELECT om.role
               FROM operator_memberships om
               JOIN project_teams pt ON pt.team_id = om.team_id
               WHERE om.operator_id = ?1 AND pt.project_id = ?2
               LIMIT 1"#,
        )
        .bind(operator_id)
        .bind(project_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row.map(|r| r.0))
    }

    pub async fn insert_session(&self, token: &str, operator_id: &str) -> anyhow::Result<()> {
        sqlx::query(
            r#"INSERT INTO sessions (token, operator_id, created_at) VALUES (?1, ?2, ?3)"#,
        )
        .bind(token)
        .bind(operator_id)
        .bind(Utc::now().to_rfc3339())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn insert_audit_log(
        &self,
        operator_id: &str,
        action: &str,
        resource_type: &str,
        resource_id: Option<&str>,
        project_id: Option<&str>,
        env_id: Option<&str>,
        metadata: Option<serde_json::Value>,
    ) -> anyhow::Result<()> {
        let id = ulid::Ulid::new().to_string();
        let created_at = Utc::now().to_rfc3339();
        let metadata_json = metadata.map(|m| m.to_string());
        sqlx::query(
            r#"INSERT INTO audit_logs (id, operator_id, action, resource_type, resource_id, project_id, env_id, metadata_json, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)"#,
        )
        .bind(id)
        .bind(operator_id)
        .bind(action)
        .bind(resource_type)
        .bind(resource_id)
        .bind(project_id)
        .bind(env_id)
        .bind(metadata_json)
        .bind(created_at)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    #[allow(dead_code)]
    pub async fn list_audit_logs(&self, limit: usize) -> anyhow::Result<Vec<AuditLogRow>> {
        self.query_audit_logs(None, None, None, None, None, limit).await
    }

    pub async fn query_audit_logs(
        &self,
        project_id: Option<&str>,
        env_id: Option<&str>,
        operator_id: Option<&str>,
        action: Option<&str>,
        resource_type: Option<&str>,
        limit: usize,
    ) -> anyhow::Result<Vec<AuditLogRow>> {
        let mut qb = sqlx::QueryBuilder::<sqlx::Sqlite>::new(
            "SELECT id, operator_id, action, resource_type, resource_id, project_id, env_id, metadata_json, created_at FROM audit_logs",
        );
        let mut conditions = qb.separated(" WHERE ");
        if let Some(project_id) = project_id {
            conditions.push("project_id = ").push_bind(project_id);
        }
        if let Some(env_id) = env_id {
            conditions.push("env_id = ").push_bind(env_id);
        }
        if let Some(operator_id) = operator_id {
            conditions.push("operator_id = ").push_bind(operator_id);
        }
        if let Some(action) = action {
            conditions.push("action = ").push_bind(action);
        }
        if let Some(resource_type) = resource_type {
            conditions.push("resource_type = ").push_bind(resource_type);
        }
        qb.push(" ORDER BY created_at DESC");
        qb.push(" LIMIT ").push_bind(limit as i64);
        let rows = qb.build_query_as::<AuditLogRow>().fetch_all(&self.pool).await?;
        Ok(rows)
    }

    pub async fn delete_session(&self, token: &str) -> anyhow::Result<()> {
        sqlx::query(r#"DELETE FROM sessions WHERE token = ?1"#)
            .bind(token)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn get_operator_by_token(&self, token: &str) -> anyhow::Result<Option<OperatorRow>> {
        let row = sqlx::query_as::<_, OperatorRow>(
            r#"SELECT o.id, o.email, o.password_hash, o.roles, o.status, o.created_at
               FROM sessions s JOIN operators o ON s.operator_id = o.id
               WHERE s.token = ?1"#,
        )
        .bind(token)
        .fetch_optional(&self.pool)
        .await?;

        Ok(row)
    }

    pub async fn create_project(&self, name: &str, operator_id: &str) -> anyhow::Result<ProjectRow> {
        let id = ulid::Ulid::new().to_string();
        let created_at = Utc::now().to_rfc3339();
        sqlx::query(
            r#"INSERT INTO projects (id, name, created_at) VALUES (?1, ?2, ?3)"#,
        )
        .bind(&id)
        .bind(name)
        .bind(&created_at)
        .execute(&self.pool)
        .await?;

        let team_id = self.ensure_default_team(operator_id).await?;
        sqlx::query(r#"INSERT OR IGNORE INTO project_teams (project_id, team_id) VALUES (?1, ?2)"#)
            .bind(&id)
            .bind(&team_id)
            .execute(&self.pool)
            .await?;

        Ok(ProjectRow {
            id,
            name: name.to_string(),
            created_at,
        })
    }

    pub async fn list_projects(&self, operator_id: &str) -> anyhow::Result<Vec<ProjectRow>> {
        let rows = sqlx::query_as::<_, ProjectRow>(
            r#"SELECT p.id, p.name, p.created_at
               FROM projects p
               JOIN project_teams pt ON pt.project_id = p.id
               JOIN operator_memberships om ON om.team_id = pt.team_id
               WHERE om.operator_id = ?1
               ORDER BY p.created_at ASC"#,
        )
        .bind(operator_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn get_project_by_name(&self, name: &str) -> anyhow::Result<Option<ProjectRow>> {
        let row = sqlx::query_as::<_, ProjectRow>(
            r#"SELECT id, name, created_at FROM projects WHERE name = ?1"#,
        )
        .bind(name)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn get_project_by_id(&self, id: &str) -> anyhow::Result<Option<ProjectRow>> {
        let row = sqlx::query_as::<_, ProjectRow>(
            r#"SELECT id, name, created_at FROM projects WHERE id = ?1"#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn create_env(&self, project_id: &str, name: &str) -> anyhow::Result<EnvRow> {
        let id = ulid::Ulid::new().to_string();
        let created_at = Utc::now().to_rfc3339();
        sqlx::query(
            r#"INSERT INTO envs (id, project_id, name, created_at) VALUES (?1, ?2, ?3, ?4)"#,
        )
        .bind(&id)
        .bind(project_id)
        .bind(name)
        .bind(&created_at)
        .execute(&self.pool)
        .await?;

        Ok(EnvRow {
            id,
            project_id: project_id.to_string(),
            name: name.to_string(),
            created_at,
        })
    }

    pub async fn list_envs(&self, project_id: &str) -> anyhow::Result<Vec<EnvRow>> {
        let rows = sqlx::query_as::<_, EnvRow>(
            r#"SELECT id, project_id, name, created_at FROM envs WHERE project_id = ?1 ORDER BY created_at ASC"#,
        )
        .bind(project_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn get_env(&self, project_id: &str, name: &str) -> anyhow::Result<Option<EnvRow>> {
        let row = sqlx::query_as::<_, EnvRow>(
            r#"SELECT id, project_id, name, created_at FROM envs WHERE project_id = ?1 AND name = ?2"#,
        )
        .bind(project_id)
        .bind(name)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn get_env_by_id(&self, id: &str) -> anyhow::Result<Option<EnvRow>> {
        let row = sqlx::query_as::<_, EnvRow>(
            r#"SELECT id, project_id, name, created_at FROM envs WHERE id = ?1"#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn upsert_connection(
        &self,
        project_id: &str,
        env_id: &str,
        name: &str,
        engine: &str,
        db_url: &str,
    ) -> anyhow::Result<ConnectionRow> {
        let id = ulid::Ulid::new().to_string();
        let created_at = Utc::now().to_rfc3339();
        let enc = encrypt_string(&self.secret_key, db_url)?;

        sqlx::query(
            r#"INSERT INTO connections (id, project_id, env_id, name, engine, db_url_enc, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
               ON CONFLICT(project_id, env_id, name) DO UPDATE SET
                 engine=excluded.engine, db_url_enc=excluded.db_url_enc"#,
        )
        .bind(&id)
        .bind(project_id)
        .bind(env_id)
        .bind(name)
        .bind(engine)
        .bind(enc)
        .bind(&created_at)
        .execute(&self.pool)
        .await?;

        let row = self.get_connection(project_id, env_id, name).await?;
        row.ok_or_else(|| anyhow::anyhow!("connection missing"))
    }

    pub async fn list_connections(
        &self,
        project_id: &str,
        env_id: &str,
    ) -> anyhow::Result<Vec<ConnectionRow>> {
        let rows = sqlx::query_as::<_, ConnectionRow>(
            r#"SELECT id, project_id, env_id, name, engine, db_url_enc, created_at
               FROM connections WHERE project_id = ?1 AND env_id = ?2"#,
        )
        .bind(project_id)
        .bind(env_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn insert_schema_snapshot(
        &self,
        project_id: &str,
        env_id: &str,
        connection_name: &str,
        snapshot_json: &str,
    ) -> anyhow::Result<String> {
        let id = ulid::Ulid::new().to_string();
        let created_at = Utc::now().to_rfc3339();
        sqlx::query(
            r#"INSERT INTO schema_snapshots (id, project_id, env_id, connection_name, snapshot_json, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6)"#,
        )
        .bind(&id)
        .bind(project_id)
        .bind(env_id)
        .bind(connection_name)
        .bind(snapshot_json)
        .bind(created_at)
        .execute(&self.pool)
        .await?;
        Ok(id)
    }

    pub async fn get_latest_snapshot(
        &self,
        project_id: &str,
        env_id: &str,
        connection_name: &str,
    ) -> anyhow::Result<Option<SchemaSnapshotRow>> {
        let row = sqlx::query_as::<_, SchemaSnapshotRow>(
            r#"SELECT id, project_id, env_id, connection_name, snapshot_json, created_at
               FROM schema_snapshots
               WHERE project_id = ?1 AND env_id = ?2 AND connection_name = ?3
               ORDER BY created_at DESC
               LIMIT 1"#,
        )
        .bind(project_id)
        .bind(env_id)
        .bind(connection_name)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn get_connection(
        &self,
        project_id: &str,
        env_id: &str,
        name: &str,
    ) -> anyhow::Result<Option<ConnectionRow>> {
        let row = sqlx::query_as::<_, ConnectionRow>(
            r#"SELECT id, project_id, env_id, name, engine, db_url_enc, created_at
               FROM connections WHERE project_id = ?1 AND env_id = ?2 AND name = ?3"#,
        )
        .bind(project_id)
        .bind(env_id)
        .bind(name)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn decrypt_db_url(&self, row: &ConnectionRow) -> anyhow::Result<String> {
        decrypt_string(&self.secret_key, &row.db_url_enc)
    }

    pub async fn create_api_key(
        &self,
        project_id: &str,
        env_id: &str,
        name: &str,
        roles: &[String],
        status: ApiKeyStatus,
        secret_hash: &str,
    ) -> anyhow::Result<ApiKey> {
        let key_id = ApiKeyId::new(format!("key_{}", ulid::Ulid::new()));
        let created_at = Utc::now();
        let roles_json = serde_json::to_string(roles)?;

        sqlx::query(
            r#"INSERT INTO api_keys (id, project_id, env_id, name, roles, status, secret_hash, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"#,
        )
        .bind(key_id.as_str())
        .bind(project_id)
        .bind(env_id)
        .bind(name)
        .bind(roles_json)
        .bind(status.as_str())
        .bind(secret_hash)
        .bind(created_at.to_rfc3339())
        .execute(&self.pool)
        .await?;

        Ok(ApiKey {
            id: key_id,
            name: name.to_string(),
            project_id: project_id.to_string(),
            env_id: env_id.to_string(),
            roles: roles.to_vec(),
            status,
            created_at,
            last_used_at: None,
        })
    }

    pub async fn list_api_keys(&self, project_id: &str, env_id: &str) -> anyhow::Result<Vec<ApiKey>> {
        let rows = sqlx::query_as::<_, ApiKeyRow>(
            r#"SELECT id, project_id, env_id, name, roles, status, secret_hash, created_at, last_used_at
               FROM api_keys WHERE project_id = ?1 AND env_id = ?2"#,
        )
        .bind(project_id)
        .bind(env_id)
        .fetch_all(&self.pool)
        .await?;

        rows.into_iter().map(ApiKeyRow::into_api_key).collect()
    }

    pub async fn revoke_api_key(&self, id: &str, project_id: &str, env_id: &str) -> anyhow::Result<()> {
        sqlx::query(
            r#"UPDATE api_keys SET status = ?1 WHERE id = ?2 AND project_id = ?3 AND env_id = ?4"#,
        )
        .bind(ApiKeyStatus::Revoked.as_str())
        .bind(id)
        .bind(project_id)
        .bind(env_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_api_key(&self, id: &str) -> anyhow::Result<Option<ApiKeyRow>> {
        let row = sqlx::query_as::<_, ApiKeyRow>(
            r#"SELECT id, project_id, env_id, name, roles, status, secret_hash, created_at, last_used_at
               FROM api_keys WHERE id = ?1"#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn update_api_key_last_used(&self, id: &str, when: DateTime<Utc>) -> anyhow::Result<()> {
        sqlx::query(r#"UPDATE api_keys SET last_used_at = ?1 WHERE id = ?2"#)
            .bind(when.to_rfc3339())
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn create_release(
        &self,
        project_id: &str,
        env_id: &str,
        reference: &str,
        schema: &ProjectSchema,
        permissions: &PermissionPolicy,
        storage: &StorageConfig,
        logics: &std::collections::HashMap<String, String>,
        snapshot_hash: &str,
    ) -> anyhow::Result<ReleaseRow> {
        let id = ulid::Ulid::new().to_string();
        let created_at = Utc::now().to_rfc3339();
        let schema_json = serde_json::to_string(schema)?;
        let permissions_yaml = serde_yaml::to_string(permissions)?;
        let storage_yaml = serde_yaml::to_string(storage)?;
        let logics_json = serde_json::to_string(logics)?;

        sqlx::query(
            r#"INSERT INTO releases (id, project_id, env_id, ref, schema_json, permissions_yaml, storage_yaml, logics_json, created_at, snapshot_hash)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"#,
        )
        .bind(&id)
        .bind(project_id)
        .bind(env_id)
        .bind(reference)
        .bind(schema_json)
        .bind(permissions_yaml)
        .bind(storage_yaml)
        .bind(logics_json)
        .bind(&created_at)
        .bind(snapshot_hash)
        .execute(&self.pool)
        .await?;

        Ok(ReleaseRow {
            id,
            project_id: project_id.to_string(),
            env_id: env_id.to_string(),
            reference: reference.to_string(),
            schema_json: serde_json::to_string(schema)?,
            permissions_yaml: serde_yaml::to_string(permissions)?,
            storage_yaml: serde_yaml::to_string(storage)?,
            logics_json: serde_json::to_string(logics)?,
            created_at,
            snapshot_hash: snapshot_hash.to_string(),
        })
    }

    pub async fn find_release_by_hash(
        &self,
        project_id: &str,
        env_id: &str,
        snapshot_hash: &str,
    ) -> anyhow::Result<Option<ReleaseRow>> {
        let row = sqlx::query_as::<_, ReleaseRow>(
            r#"SELECT id, project_id, env_id, ref, schema_json, permissions_yaml, storage_yaml, logics_json, created_at, snapshot_hash
               FROM releases WHERE project_id = ?1 AND env_id = ?2 AND snapshot_hash = ?3"#,
        )
        .bind(project_id)
        .bind(env_id)
        .bind(snapshot_hash)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn list_releases(
        &self,
        project_id: &str,
        env_id: &str,
        limit: Option<usize>,
    ) -> anyhow::Result<Vec<ReleaseRow>> {
        let mut query = String::from(
            "SELECT id, project_id, env_id, ref, schema_json, permissions_yaml, storage_yaml, logics_json, created_at, snapshot_hash FROM releases WHERE project_id = ?1 AND env_id = ?2 ORDER BY created_at DESC",
        );
        if limit.is_some() {
            query.push_str(" LIMIT ?3");
        }
        let mut q = sqlx::query_as::<_, ReleaseRow>(&query).bind(project_id).bind(env_id);
        if let Some(lim) = limit {
            q = q.bind(lim as i64);
        }
        Ok(q.fetch_all(&self.pool).await?)
    }

    pub async fn get_release(&self, id: &str) -> anyhow::Result<Option<ReleaseRow>> {
        let row = sqlx::query_as::<_, ReleaseRow>(
            r#"SELECT id, project_id, env_id, ref, schema_json, permissions_yaml, storage_yaml, logics_json, created_at, snapshot_hash
               FROM releases WHERE id = ?1"#,
        )
        .bind(id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn set_current_release(
        &self,
        project_id: &str,
        env_id: &str,
        release_id: &str,
    ) -> anyhow::Result<()> {
        sqlx::query(
            r#"INSERT INTO env_current (project_id, env_id, release_id)
               VALUES (?1, ?2, ?3)
               ON CONFLICT(project_id, env_id) DO UPDATE SET release_id = excluded.release_id"#,
        )
        .bind(project_id)
        .bind(env_id)
        .bind(release_id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_current_release(
        &self,
        project_id: &str,
        env_id: &str,
    ) -> anyhow::Result<Option<String>> {
        let row = sqlx::query_scalar::<_, String>(
            r#"SELECT release_id FROM env_current WHERE project_id = ?1 AND env_id = ?2"#,
        )
        .bind(project_id)
        .bind(env_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn create_end_user(
        &self,
        project_id: &str,
        env_id: &str,
        email: &str,
        password_hash: &str,
        roles: &[String],
    ) -> anyhow::Result<EndUserRow> {
        let id = ulid::Ulid::new().to_string();
        let created_at = Utc::now().to_rfc3339();
        let roles_json = serde_json::to_string(roles)?;
        sqlx::query(
            r#"INSERT INTO end_users (id, project_id, env_id, email, password_hash, roles, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"#,
        )
        .bind(&id)
        .bind(project_id)
        .bind(env_id)
        .bind(email)
        .bind(password_hash)
        .bind(roles_json)
        .bind(&created_at)
        .execute(&self.pool)
        .await?;

        Ok(EndUserRow {
            id,
            project_id: project_id.to_string(),
            env_id: env_id.to_string(),
            email: email.to_string(),
            password_hash: password_hash.to_string(),
            roles: roles.to_vec(),
            created_at,
        })
    }

    pub async fn get_end_user(
        &self,
        project_id: &str,
        env_id: &str,
        email: &str,
    ) -> anyhow::Result<Option<EndUserRow>> {
        let row = sqlx::query_as::<_, EndUserRow>(
            r#"SELECT id, project_id, env_id, email, password_hash, roles, created_at
               FROM end_users WHERE project_id = ?1 AND env_id = ?2 AND email = ?3"#,
        )
        .bind(project_id)
        .bind(env_id)
        .bind(email)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn get_end_user_by_id(
        &self,
        end_user_id: &str,
    ) -> anyhow::Result<Option<EndUserRow>> {
        let row = sqlx::query_as::<_, EndUserRow>(
            r#"SELECT id, project_id, env_id, email, password_hash, roles, created_at
               FROM end_users WHERE id = ?1"#,
        )
        .bind(end_user_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn insert_refresh_token(
        &self,
        end_user_id: &str,
        project_id: &str,
        env_id: &str,
        token_hash: &str,
        expires_at: DateTime<Utc>,
    ) -> anyhow::Result<String> {
        let id = ulid::Ulid::new().to_string();
        let created_at = Utc::now().to_rfc3339();
        sqlx::query(
            r#"INSERT INTO refresh_tokens (id, end_user_id, project_id, env_id, token_hash, expires_at, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"#,
        )
        .bind(&id)
        .bind(end_user_id)
        .bind(project_id)
        .bind(env_id)
        .bind(token_hash)
        .bind(expires_at.to_rfc3339())
        .bind(&created_at)
        .execute(&self.pool)
        .await?;
        Ok(id)
    }

    pub async fn revoke_refresh_token(&self, token_id: &str) -> anyhow::Result<()> {
        sqlx::query(r#"UPDATE refresh_tokens SET revoked_at = ?1 WHERE id = ?2"#)
            .bind(Utc::now().to_rfc3339())
            .bind(token_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn get_refresh_token(&self, token_id: &str) -> anyhow::Result<Option<RefreshTokenRow>> {
        let row = sqlx::query_as::<_, RefreshTokenRow>(
            r#"SELECT id, end_user_id, project_id, env_id, token_hash, expires_at, revoked_at, created_at
               FROM refresh_tokens WHERE id = ?1"#,
        )
        .bind(token_id)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn upsert_oidc_provider(
        &self,
        project_id: &str,
        env_id: &str,
        name: &str,
        issuer: &str,
        auth_url: &str,
        token_url: &str,
        userinfo_url: Option<&str>,
        client_id: &str,
        client_secret: &str,
        redirect_uris: &[String],
    ) -> anyhow::Result<OidcProviderRow> {
        let id = ulid::Ulid::new().to_string();
        let created_at = Utc::now().to_rfc3339();
        let redirect_json = serde_json::to_string(redirect_uris)?;

        sqlx::query(
            r#"INSERT INTO oidc_providers (id, project_id, env_id, name, issuer, auth_url, token_url, userinfo_url, client_id, client_secret, redirect_uris_json, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
               ON CONFLICT(project_id, env_id, name) DO UPDATE SET
                 issuer=excluded.issuer,
                 auth_url=excluded.auth_url,
                 token_url=excluded.token_url,
                 userinfo_url=excluded.userinfo_url,
                 client_id=excluded.client_id,
                 client_secret=excluded.client_secret,
                 redirect_uris_json=excluded.redirect_uris_json"#,
        )
        .bind(&id)
        .bind(project_id)
        .bind(env_id)
        .bind(name)
        .bind(issuer)
        .bind(auth_url)
        .bind(token_url)
        .bind(userinfo_url)
        .bind(client_id)
        .bind(client_secret)
        .bind(redirect_json)
        .bind(created_at)
        .execute(&self.pool)
        .await?;

        self.get_oidc_provider(project_id, env_id, name)
            .await
            .map(|opt| opt.ok_or_else(|| anyhow::anyhow!("oidc provider missing")))? 
    }

    pub async fn get_oidc_provider(
        &self,
        project_id: &str,
        env_id: &str,
        name: &str,
    ) -> anyhow::Result<Option<OidcProviderRow>> {
        let row = sqlx::query_as::<_, OidcProviderRow>(
            r#"SELECT id, project_id, env_id, name, issuer, auth_url, token_url, userinfo_url, client_id, client_secret, redirect_uris_json, created_at
               FROM oidc_providers WHERE project_id = ?1 AND env_id = ?2 AND name = ?3"#,
        )
        .bind(project_id)
        .bind(env_id)
        .bind(name)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn list_oidc_providers(
        &self,
        project_id: &str,
        env_id: &str,
    ) -> anyhow::Result<Vec<OidcProviderRow>> {
        let rows = sqlx::query_as::<_, OidcProviderRow>(
            r#"SELECT id, project_id, env_id, name, issuer, auth_url, token_url, userinfo_url, client_id, client_secret, redirect_uris_json, created_at
               FROM oidc_providers WHERE project_id = ?1 AND env_id = ?2 ORDER BY created_at ASC"#,
        )
        .bind(project_id)
        .bind(env_id)
        .fetch_all(&self.pool)
        .await?;
        Ok(rows)
    }

    pub async fn delete_oidc_provider(
        &self,
        project_id: &str,
        env_id: &str,
        name: &str,
    ) -> anyhow::Result<bool> {
        let result = sqlx::query(
            r#"DELETE FROM oidc_providers WHERE project_id = ?1 AND env_id = ?2 AND name = ?3"#,
        )
        .bind(project_id)
        .bind(env_id)
        .bind(name)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() > 0)
    }

    pub async fn insert_oidc_session(
        &self,
        state: &str,
        project_id: &str,
        env_id: &str,
        provider: &str,
        redirect_uri: &str,
    ) -> anyhow::Result<()> {
        sqlx::query(
            r#"INSERT INTO oidc_sessions (state, project_id, env_id, provider, redirect_uri, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6)"#,
        )
        .bind(state)
        .bind(project_id)
        .bind(env_id)
        .bind(provider)
        .bind(redirect_uri)
        .bind(Utc::now().to_rfc3339())
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn take_oidc_session(&self, state: &str) -> anyhow::Result<Option<OidcSessionRow>> {
        let row = sqlx::query_as::<_, OidcSessionRow>(
            r#"SELECT state, project_id, env_id, provider, redirect_uri, created_at FROM oidc_sessions WHERE state = ?1"#,
        )
        .bind(state)
        .fetch_optional(&self.pool)
        .await?;

        if row.is_some() {
            sqlx::query(r#"DELETE FROM oidc_sessions WHERE state = ?1"#)
                .bind(state)
                .execute(&self.pool)
                .await?;
        }
        Ok(row)
    }

    pub async fn get_end_user_by_identity(
        &self,
        project_id: &str,
        env_id: &str,
        provider: &str,
        subject: &str,
    ) -> anyhow::Result<Option<EndUserRow>> {
        let row = sqlx::query_as::<_, EndUserRow>(
            r#"SELECT e.id, e.project_id, e.env_id, e.email, e.password_hash, e.roles, e.created_at
               FROM end_users e
               JOIN end_user_identities i ON i.end_user_id = e.id
               WHERE i.project_id = ?1 AND i.env_id = ?2 AND i.provider = ?3 AND i.subject = ?4"#,
        )
        .bind(project_id)
        .bind(env_id)
        .bind(provider)
        .bind(subject)
        .fetch_optional(&self.pool)
        .await?;
        Ok(row)
    }

    pub async fn link_end_user_identity(
        &self,
        end_user_id: &str,
        project_id: &str,
        env_id: &str,
        provider: &str,
        subject: &str,
    ) -> anyhow::Result<()> {
        let id = ulid::Ulid::new().to_string();
        sqlx::query(
            r#"INSERT OR IGNORE INTO end_user_identities (id, end_user_id, project_id, env_id, provider, subject, created_at)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"#,
        )
        .bind(id)
        .bind(end_user_id)
        .bind(project_id)
        .bind(env_id)
        .bind(provider)
        .bind(subject)
        .bind(Utc::now().to_rfc3339())
        .execute(&self.pool)
        .await?;
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct OperatorRow {
    pub id: String,
    pub email: String,
    pub password_hash: String,
    pub roles: String,
    pub status: String,
    pub created_at: String,
}

impl OperatorRow {
    pub fn roles(&self) -> anyhow::Result<Vec<String>> {
        Ok(serde_json::from_str(&self.roles)?)
    }

    pub fn is_active(&self) -> bool {
        self.status == "active"
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct OrgRow {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct TeamRow {
    pub id: String,
    pub org_id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct OidcProviderRow {
    pub id: String,
    pub project_id: String,
    pub env_id: String,
    pub name: String,
    pub issuer: String,
    pub auth_url: String,
    pub token_url: String,
    pub userinfo_url: Option<String>,
    pub client_id: String,
    pub client_secret: String,
    pub redirect_uris_json: String,
    pub created_at: String,
}

impl OidcProviderRow {
    pub fn redirect_uris(&self) -> anyhow::Result<Vec<String>> {
        Ok(serde_json::from_str(&self.redirect_uris_json)?)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct OidcSessionRow {
    pub state: String,
    pub project_id: String,
    pub env_id: String,
    pub provider: String,
    pub redirect_uri: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ProjectRow {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EnvRow {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ConnectionRow {
    pub id: String,
    pub project_id: String,
    pub env_id: String,
    pub name: String,
    pub engine: String,
    pub db_url_enc: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ApiKeyRow {
    pub id: String,
    pub project_id: String,
    pub env_id: String,
    pub name: String,
    pub roles: String,
    pub status: String,
    pub secret_hash: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

impl ApiKeyRow {
    pub fn into_api_key(self) -> anyhow::Result<ApiKey> {
        let roles: Vec<String> = serde_json::from_str(&self.roles)?;
        let status = ApiKeyStatus::from_str(&self.status)
            .ok_or_else(|| anyhow::anyhow!("invalid api key status"))?;
        let created_at = DateTime::parse_from_rfc3339(&self.created_at)?.with_timezone(&Utc);
        let last_used_at = match self.last_used_at {
            Some(value) => Some(DateTime::parse_from_rfc3339(&value)?.with_timezone(&Utc)),
            None => None,
        };
        Ok(ApiKey {
            id: ApiKeyId::new(self.id),
            name: self.name,
            project_id: self.project_id,
            env_id: self.env_id,
            roles,
            status,
            created_at,
            last_used_at,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ReleaseRow {
    pub id: String,
    pub project_id: String,
    pub env_id: String,
    #[sqlx(rename = "ref")]
    pub reference: String,
    pub schema_json: String,
    pub permissions_yaml: String,
    pub storage_yaml: String,
    pub logics_json: String,
    pub created_at: String,
    pub snapshot_hash: String,
}

impl ReleaseRow {
    pub fn schema(&self) -> anyhow::Result<ProjectSchema> {
        Ok(serde_json::from_str(&self.schema_json)?)
    }

    pub fn permissions(&self) -> anyhow::Result<PermissionPolicy> {
        Ok(serde_yaml::from_str(&self.permissions_yaml)?)
    }

    pub fn storage(&self) -> anyhow::Result<StorageConfig> {
        Ok(serde_yaml::from_str(&self.storage_yaml)?)
    }

    pub fn logics(&self) -> anyhow::Result<std::collections::HashMap<String, String>> {
        Ok(serde_json::from_str(&self.logics_json)?)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SchemaSnapshotRow {
    pub id: String,
    pub project_id: String,
    pub env_id: String,
    pub connection_name: String,
    pub snapshot_json: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AuditLogRow {
    pub id: String,
    pub operator_id: String,
    pub action: String,
    pub resource_type: String,
    pub resource_id: Option<String>,
    pub project_id: Option<String>,
    pub env_id: Option<String>,
    pub metadata_json: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EndUserRow {
    pub id: String,
    pub project_id: String,
    pub env_id: String,
    pub email: String,
    pub password_hash: String,
    pub roles: Vec<String>,
    pub created_at: String,
}

impl<'r> sqlx::FromRow<'r, sqlx::sqlite::SqliteRow> for EndUserRow {
    fn from_row(row: &'r sqlx::sqlite::SqliteRow) -> Result<Self, sqlx::Error> {
        let roles_json: String = row.try_get("roles")?;
        let roles: Vec<String> = serde_json::from_str(&roles_json).unwrap_or_default();
        Ok(Self {
            id: row.try_get("id")?,
            project_id: row.try_get("project_id")?,
            env_id: row.try_get("env_id")?,
            email: row.try_get("email")?,
            password_hash: row.try_get("password_hash")?,
            roles,
            created_at: row.try_get("created_at")?,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RefreshTokenRow {
    pub id: String,
    pub end_user_id: String,
    pub project_id: String,
    pub env_id: String,
    pub token_hash: String,
    pub expires_at: String,
    pub revoked_at: Option<String>,
    pub created_at: String,
}

pub fn compute_snapshot_hash(
    schema: &ProjectSchema,
    permissions: &PermissionPolicy,
    storage: &StorageConfig,
    logics: &std::collections::HashMap<String, String>,
    r#ref: &str,
) -> anyhow::Result<String> {
    let schema_json = serde_json::to_string(schema)?;
    let permissions_json = serde_json::to_string(permissions)?;
    let storage_json = serde_json::to_string(storage)?;
    let logics_json = serde_json::to_string(logics)?;
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    schema_json.hash(&mut hasher);
    permissions_json.hash(&mut hasher);
    storage_json.hash(&mut hasher);
    logics_json.hash(&mut hasher);
    r#ref.hash(&mut hasher);
    Ok(format!("{:x}", hasher.finish()))
}

pub fn connections_map(rows: &[ConnectionRow], decrypted: &[String]) -> HashMap<String, ConnectionInfo> {
    let mut map = HashMap::new();
    for (row, db_url) in rows.iter().zip(decrypted.iter()) {
        map.insert(
            row.name.clone(),
            ConnectionInfo {
                name: row.name.clone(),
                engine: row.engine.clone(),
                db_url: db_url.clone(),
            },
        );
    }
    map
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectionInfo {
    pub name: String,
    pub engine: String,
    pub db_url: String,
}
