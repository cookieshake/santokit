//! Bridge 앱 상태

use std::collections::HashMap;
use std::sync::RwLock;

use stk_core::permissions::PermissionPolicy;
use stk_core::schema::ProjectSchema;

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
    /// TODO: 실제 구현 시 sqlx::PgPool 사용
    pub db_pools: RwLock<HashMap<String, ()>>,
}

/// 캐시된 릴리즈 정보
#[derive(Debug, Clone)]
pub struct CachedRelease {
    /// 릴리즈 ID
    pub release_id: String,

    /// 프로젝트 스키마
    pub schema: ProjectSchema,

    /// 권한 정책
    pub permissions: PermissionPolicy,

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

        // TODO: Hub에서 릴리즈 조회 및 캐시 갱신
        None
    }

    /// 릴리즈 캐시 갱신
    pub fn update_release_cache(&self, project: &str, env: &str, release: CachedRelease) {
        let key = Self::cache_key(project, env);
        let mut cache = self.release_cache.write().unwrap();
        cache.insert(key, release);
    }
}
