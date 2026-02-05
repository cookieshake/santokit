//! 권한 정책 정의
//!
//! `config/permissions.yaml`의 구조를 정의합니다.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// 전체 권한 정책
///
/// `config/permissions.yaml` 파일의 루트 구조입니다.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PermissionPolicy {
    /// 테이블별 권한 정책
    #[serde(default)]
    pub tables: HashMap<String, TablePermissions>,
}

/// 테이블 권한 정책
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TablePermissions {
    /// SELECT 권한
    #[serde(default)]
    pub select: Option<OperationPermission>,

    /// INSERT 권한
    #[serde(default)]
    pub insert: Option<OperationPermission>,

    /// UPDATE 권한
    #[serde(default)]
    pub update: Option<OperationPermission>,

    /// DELETE 권한
    #[serde(default)]
    pub delete: Option<OperationPermission>,

    /// 컬럼별 세부 권한
    #[serde(default)]
    pub columns: Option<ColumnPermissions>,
}

/// 작업(Operation)별 권한 설정
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationPermission {
    /// 허용되는 role 목록
    #[serde(default)]
    pub roles: Vec<RoleRequirement>,

    /// CEL 조건식 (추가 필터)
    #[serde(default)]
    pub condition: Option<String>,
}

impl Default for OperationPermission {
    fn default() -> Self {
        Self {
            roles: vec![RoleRequirement::Authenticated],
            condition: None,
        }
    }
}

/// Role 요구사항
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub enum RoleRequirement {
    /// 인증 없이 허용
    #[serde(rename = "public")]
    Public,

    /// 인증된 사용자만 허용
    #[serde(rename = "authenticated")]
    Authenticated,

    /// 특정 role 필요
    Role(String),
}

impl RoleRequirement {
    /// 문자열에서 파싱
    pub fn from_str(s: &str) -> Self {
        match s {
            "public" => RoleRequirement::Public,
            "authenticated" => RoleRequirement::Authenticated,
            role => RoleRequirement::Role(role.to_string()),
        }
    }

    /// public 여부
    pub fn is_public(&self) -> bool {
        matches!(self, RoleRequirement::Public)
    }

    /// authenticated 여부
    pub fn is_authenticated(&self) -> bool {
        matches!(self, RoleRequirement::Authenticated)
    }
}

impl<'de> Deserialize<'de> for RoleRequirement {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let value = String::deserialize(deserializer)?;
        Ok(RoleRequirement::from_str(value.as_str()))
    }
}

/// 컬럼별 권한 설정
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ColumnPermissions {
    /// SELECT 가능한 컬럼 목록
    ///
    /// - `["*"]`: 모든 컬럼
    /// - `["*", "!c_*", "!p_*"]`: 모든 컬럼에서 c_, p_ prefix 제외
    /// - `["email", "name"]`: 특정 컬럼만
    #[serde(default)]
    pub select: Vec<String>,

    /// INSERT 가능한 컬럼 목록
    #[serde(default)]
    pub insert: Vec<String>,

    /// UPDATE 가능한 컬럼 목록
    #[serde(default)]
    pub update: Vec<String>,
}

impl ColumnPermissions {
    /// 특정 컬럼이 SELECT에 허용되는지 확인
    pub fn allows_select(&self, column_name: &str) -> bool {
        Self::matches_column_rules(&self.select, column_name)
    }

    /// 특정 컬럼이 INSERT에 허용되는지 확인
    pub fn allows_insert(&self, column_name: &str) -> bool {
        Self::matches_column_rules(&self.insert, column_name)
    }

    /// 특정 컬럼이 UPDATE에 허용되는지 확인
    pub fn allows_update(&self, column_name: &str) -> bool {
        Self::matches_column_rules(&self.update, column_name)
    }

    /// 컬럼 규칙 매칭
    fn matches_column_rules(rules: &[String], column_name: &str) -> bool {
        if rules.is_empty() {
            return true; // 규칙 없으면 허용
        }

        let mut allowed = false;

        for rule in rules {
            if rule == "*" {
                allowed = true;
            } else if let Some(pattern) = rule.strip_prefix('!') {
                // 제외 패턴
                if Self::matches_pattern(pattern, column_name) {
                    allowed = false;
                }
            } else {
                // 포함 패턴
                if Self::matches_pattern(rule, column_name) {
                    allowed = true;
                }
            }
        }

        allowed
    }

    /// 간단한 와일드카드 패턴 매칭 (prefix_*)
    fn matches_pattern(pattern: &str, name: &str) -> bool {
        if pattern == "*" {
            return true;
        }

        if let Some(prefix) = pattern.strip_suffix('*') {
            return name.starts_with(prefix);
        }

        pattern == name
    }
}

/// CRUD 작업 타입
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Operation {
    Select,
    Insert,
    Update,
    Delete,
}

impl Operation {
    /// 문자열에서 파싱
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "select" => Some(Operation::Select),
            "insert" => Some(Operation::Insert),
            "update" => Some(Operation::Update),
            "delete" => Some(Operation::Delete),
            _ => None,
        }
    }

    /// 문자열로 변환
    pub fn as_str(&self) -> &'static str {
        match self {
            Operation::Select => "select",
            Operation::Insert => "insert",
            Operation::Update => "update",
            Operation::Delete => "delete",
        }
    }
}

impl TablePermissions {
    /// 특정 작업의 권한 설정 가져오기
    pub fn get_operation(&self, op: Operation) -> Option<&OperationPermission> {
        match op {
            Operation::Select => self.select.as_ref(),
            Operation::Insert => self.insert.as_ref(),
            Operation::Update => self.update.as_ref(),
            Operation::Delete => self.delete.as_ref(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_column_permission_wildcard() {
        let perms = ColumnPermissions {
            select: vec!["*".to_string()],
            insert: vec![],
            update: vec![],
        };

        assert!(perms.allows_select("any_column"));
        assert!(perms.allows_select("email"));
    }

    #[test]
    fn test_column_permission_exclude() {
        let perms = ColumnPermissions {
            select: vec!["*".to_string(), "!c_*".to_string(), "!p_*".to_string()],
            insert: vec![],
            update: vec![],
        };

        assert!(perms.allows_select("email"));
        assert!(!perms.allows_select("c_ssn"));
        assert!(!perms.allows_select("p_internal"));
    }

    #[test]
    fn test_column_permission_explicit() {
        let perms = ColumnPermissions {
            select: vec![],
            insert: vec![],
            update: vec!["name".to_string(), "avatar_url".to_string()],
        };

        assert!(perms.allows_update("name"));
        assert!(perms.allows_update("avatar_url"));
        assert!(!perms.allows_update("email"));
    }

    #[test]
    fn test_parse_permissions_yaml() {
        let yaml = r#"
tables:
  users:
    select:
      roles: [authenticated]
      condition: "resource.id == request.auth.sub"
    insert:
      roles: [public]
    update:
      roles: [authenticated]
      condition: "resource.id == request.auth.sub"
    columns:
      select: ["*", "!c_*", "!p_*"]
      update: ["name", "avatar_url"]
"#;

        let policy: PermissionPolicy = serde_yaml::from_str(yaml).unwrap();
        let users = policy.tables.get("users").unwrap();

        assert!(users.select.is_some());
        assert!(users.insert.is_some());
        assert!(users.columns.is_some());

        let cols = users.columns.as_ref().unwrap();
        assert!(cols.allows_select("email"));
        assert!(!cols.allows_select("c_secret"));
    }
}
