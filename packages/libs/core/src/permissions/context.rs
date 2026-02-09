//! CEL 평가 컨텍스트
//!
//! CEL 표현식 평가에 필요한 변수들을 제공합니다.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// CEL 평가 컨텍스트
///
/// CEL 표현식에서 사용할 수 있는 변수들을 담습니다.
///
/// # 사용 가능한 변수
///
/// - `request.auth.sub`: End User ID
/// - `request.auth.roles`: Role 목록
/// - `resource`: 현재 접근하려는 Row (SELECT/UPDATE/DELETE)
/// - `request.params`: 요청 파라미터
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct EvalContext {
    /// 인증 정보
    pub auth: AuthContext,

    /// 요청 파라미터
    #[serde(default)]
    pub params: HashMap<String, Value>,

    /// 현재 리소스 (Row)
    #[serde(default)]
    pub resource: Option<HashMap<String, Value>>,
}

/// 인증 컨텍스트
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct AuthContext {
    /// 사용자 ID (End User sub 또는 API Key ID)
    pub sub: Option<String>,

    /// Role 목록
    #[serde(default)]
    pub roles: Vec<String>,

    /// 프로젝트 ID
    pub project_id: Option<String>,

    /// 환경 ID
    pub env_id: Option<String>,

    /// 인증 주체 타입
    #[serde(default)]
    pub principal_type: PrincipalType,
}

/// 인증 주체 타입
#[derive(Debug, Clone, Copy, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PrincipalType {
    #[default]
    EndUser,
    ApiKey,
}

impl EvalContext {
    /// 새 컨텍스트 생성
    pub fn new() -> Self {
        Self::default()
    }

    /// 인증 정보 설정
    pub fn with_auth(mut self, auth: AuthContext) -> Self {
        self.auth = auth;
        self
    }

    /// 파라미터 설정
    pub fn with_params(mut self, params: HashMap<String, Value>) -> Self {
        self.params = params;
        self
    }

    /// 리소스(Row) 설정
    pub fn with_resource(mut self, resource: HashMap<String, Value>) -> Self {
        self.resource = Some(resource);
        self
    }

    /// 특정 role을 가지고 있는지 확인
    pub fn has_role(&self, role: &str) -> bool {
        self.auth.roles.iter().any(|r| r == role)
    }

    /// 인증되었는지 확인
    pub fn is_authenticated(&self) -> bool {
        self.auth.sub.is_some()
    }

    /// End User 인증인지 확인 (`authenticated` role requirement 용도)
    pub fn is_end_user_authenticated(&self) -> bool {
        self.auth.sub.is_some() && self.auth.principal_type == PrincipalType::EndUser
    }

    /// CEL 평가를 위한 Map으로 변환
    ///
    /// CEL 엔진에 전달할 변수 맵을 생성합니다.
    pub fn to_cel_variables(&self) -> HashMap<String, Value> {
        let mut vars = HashMap::new();

        // request.auth
        let mut auth_obj = serde_json::Map::new();
        if let Some(sub) = &self.auth.sub {
            auth_obj.insert("sub".to_string(), Value::String(sub.clone()));
        }
        auth_obj.insert(
            "roles".to_string(),
            Value::Array(self.auth.roles.iter().map(|r| Value::String(r.clone())).collect()),
        );
        if let Some(project_id) = &self.auth.project_id {
            auth_obj.insert("project_id".to_string(), Value::String(project_id.clone()));
        }
        if let Some(env_id) = &self.auth.env_id {
            auth_obj.insert("env_id".to_string(), Value::String(env_id.clone()));
        }

        // request 객체
        let mut request_obj = serde_json::Map::new();
        request_obj.insert("auth".to_string(), Value::Object(auth_obj));
        request_obj.insert("params".to_string(), serde_json::to_value(&self.params).unwrap_or(Value::Object(serde_json::Map::new())));

        vars.insert("request".to_string(), Value::Object(request_obj));

        // resource
        if let Some(resource) = &self.resource {
            vars.insert("resource".to_string(), serde_json::to_value(resource).unwrap_or(Value::Null));
        }

        vars
    }
}

impl AuthContext {
    /// 새 인증 컨텍스트 생성
    pub fn new(sub: String, roles: Vec<String>) -> Self {
        Self {
            sub: Some(sub),
            roles,
            project_id: None,
            env_id: None,
            principal_type: PrincipalType::EndUser,
        }
    }

    /// API Key 인증 컨텍스트 생성
    pub fn api_key(key_id: String, roles: Vec<String>) -> Self {
        Self {
            sub: Some(key_id),
            roles,
            project_id: None,
            env_id: None,
            principal_type: PrincipalType::ApiKey,
        }
    }

    /// End User 인증 컨텍스트 생성
    pub fn end_user(sub: String, roles: Vec<String>) -> Self {
        Self {
            sub: Some(sub),
            roles,
            project_id: None,
            env_id: None,
            principal_type: PrincipalType::EndUser,
        }
    }

    /// API Key에서 생성
    pub fn from_api_key(key_id: String, roles: Vec<String>, project_id: String, env_id: String) -> Self {
        Self {
            sub: Some(key_id),
            roles,
            project_id: Some(project_id),
            env_id: Some(env_id),
            principal_type: PrincipalType::ApiKey,
        }
    }

    /// End User 토큰에서 생성
    pub fn from_end_user(sub: String, roles: Vec<String>, project_id: String, env_id: String) -> Self {
        Self {
            sub: Some(sub),
            roles,
            project_id: Some(project_id),
            env_id: Some(env_id),
            principal_type: PrincipalType::EndUser,
        }
    }

    /// 익명 컨텍스트
    pub fn anonymous() -> Self {
        Self::default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_has_role() {
        let ctx = EvalContext::new().with_auth(AuthContext::new(
            "user_123".to_string(),
            vec!["admin".to_string(), "writer".to_string()],
        ));

        assert!(ctx.has_role("admin"));
        assert!(ctx.has_role("writer"));
        assert!(!ctx.has_role("reader"));
    }

    #[test]
    fn test_is_authenticated() {
        let authenticated = EvalContext::new().with_auth(AuthContext::new(
            "user_123".to_string(),
            vec![],
        ));
        let anonymous = EvalContext::new();

        assert!(authenticated.is_authenticated());
        assert!(!anonymous.is_authenticated());
    }

    #[test]
    fn test_to_cel_variables() {
        let ctx = EvalContext::new().with_auth(AuthContext::new(
            "user_123".to_string(),
            vec!["admin".to_string()],
        ));

        let vars = ctx.to_cel_variables();

        assert!(vars.contains_key("request"));

        let request = vars.get("request").unwrap();
        let auth = request.get("auth").unwrap();

        assert_eq!(auth.get("sub").unwrap(), "user_123");
    }
}
