//! Bridge 앱 상태

use std::collections::HashMap;
use std::sync::RwLock;

use serde::Deserialize;
use stk_core::permissions::PermissionPolicy;
use stk_core::schema::ProjectSchema;
use stk_core::storage::StorageConfig;

use crate::config::Config;

/// 앱 상태
///
/// 모든 핸들러에서 공유하는 상태입니다.
pub struct AppState {
    /// 설정
    pub config: Config,

    /// 릴리즈 캐시 (project:env → Release)
    pub release_cache: RwLock<HashMap<String, CachedRelease>>,

    /// DB Connection Pool 캐시 (connection_id → Pool)
    pub db_pools: RwLock<HashMap<String, sqlx::PgPool>>,
}

/// 캐시된 릴리즈 정보
#[derive(Debug, Clone)]
pub struct CachedRelease {
    /// 릴리즈 ID
    #[allow(dead_code)]
    pub release_id: String,

    /// 프로젝트 스키마
    pub schema: ProjectSchema,

    /// 권한 정책
    pub permissions: PermissionPolicy,

    /// Storage 설정
    pub storage: StorageConfig,

    /// 연결 정보
    pub connections: std::collections::HashMap<String, ConnectionInfo>,

    /// 캐시 시각
    pub cached_at: chrono::DateTime<chrono::Utc>,
}

impl AppState {
    /// 새 상태 생성
    pub async fn new(config: &Config) -> anyhow::Result<Self> {
        Ok(Self {
            config: config.clone(),
            release_cache: RwLock::new(HashMap::new()),
            db_pools: RwLock::new(HashMap::new()),
        })
    }

    /// 캐시 키 생성
    pub fn cache_key(project: &str, env: &str) -> String {
        format!("{}:{}", project, env)
    }

    /// 릴리즈 조회 (캐시 우선)
    pub async fn get_release(&self, project: &str, env: &str) -> Option<CachedRelease> {
        let key = Self::cache_key(project, env);

        // 캐시 조회
        {
            let cache = self.release_cache.read().unwrap();
            if let Some(release) = cache.get(&key) {
                // TTL 체크
                let elapsed = chrono::Utc::now() - release.cached_at;
                if elapsed.num_seconds() < self.config.release_cache_ttl as i64 {
                    return Some(release.clone());
                }
            }
        }

        // Hub에서 릴리즈 조회 및 캐시 갱신
        let url = format!(
            "{}/internal/releases/{}/{}/current",
            self.config.hub_url, project, env
        );

        let response = reqwest::get(url).await.ok()?;
        if !response.status().is_success() {
            return None;
        }

        let body: InternalReleaseResponse = response.json().await.ok()?;

        let release = CachedRelease {
            release_id: body.release_id,
            schema: body.schema,
            permissions: body.permissions,
            storage: body.storage,
            connections: body.connections,
            cached_at: chrono::Utc::now(),
        };

        self.update_release_cache(project, env, release.clone());

        Some(release)
    }

    /// 릴리즈 캐시 갱신
    pub fn update_release_cache(&self, project: &str, env: &str, release: CachedRelease) {
        let key = Self::cache_key(project, env);
        let mut cache = self.release_cache.write().unwrap();
        cache.insert(key, release);
    }

    /// DB 풀 조회/생성
    pub async fn get_pool(&self, conn: &ConnectionInfo) -> anyhow::Result<sqlx::PgPool> {
        if conn.engine != "postgres" {
            anyhow::bail!("unsupported connection engine: {}", conn.engine);
        }

        {
            let pools = self.db_pools.read().unwrap();
            if let Some(pool) = pools.get(&conn.name) {
                return Ok(pool.clone());
            }
        }

        let pool = sqlx::postgres::PgPoolOptions::new()
            .max_connections(5)
            .connect(&conn.db_url)
            .await?;

        let mut pools = self.db_pools.write().unwrap();
        pools.insert(conn.name.clone(), pool.clone());

        Ok(pool)
    }
}

#[derive(Debug, Deserialize)]
struct InternalReleaseResponse {
    pub release_id: String,
    pub schema: ProjectSchema,
    pub permissions: PermissionPolicy,
    pub storage: StorageConfig,
    pub connections: std::collections::HashMap<String, ConnectionInfo>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ConnectionInfo {
    pub name: String,
    pub engine: String,
    pub db_url: String,
}
