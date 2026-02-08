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

/// 권한 규칙 (하나의 role 매칭 + 조건)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PermissionRule {
    /// 허용되는 role 목록
    pub roles: Vec<RoleRequirement>,

    /// CEL 조건식 (추가 필터)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub condition: Option<String>,

    /// 허용되는 컬럼 목록 (None = 기본값 적용, Some(["*"]) = 모든 컬럼, Some([...]) = 명시적 목록)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub columns: Option<Vec<String>>,
}

/// Operation별 규칙 목록 (ordered array)
#[derive(Debug, Clone, Serialize)]
pub struct OperationRules {
    pub rules: Vec<PermissionRule>,
}

/// OperationRules의 custom deserializer (shorthand 호환)
impl<'de> Deserialize<'de> for OperationRules {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        use serde::de::{self, Visitor};

        struct OperationRulesVisitor;

        impl<'de> Visitor<'de> for OperationRulesVisitor {
            type Value = OperationRules;

            fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
                formatter.write_str("a sequence of permission rules or a single permission rule object")
            }

            fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
            where
                A: de::SeqAccess<'de>,
            {
                let mut rules = Vec::new();
                while let Some(rule) = seq.next_element::<PermissionRule>()? {
                    rules.push(rule);
                }
                Ok(OperationRules { rules })
            }

            fn visit_map<M>(self, map: M) -> Result<Self::Value, M::Error>
            where
                M: de::MapAccess<'de>,
            {
                // Shorthand: 단일 object → Vec<PermissionRule>
                let rule = PermissionRule::deserialize(de::value::MapAccessDeserializer::new(map))?;
                Ok(OperationRules { rules: vec![rule] })
            }
        }

        deserializer.deserialize_any(OperationRulesVisitor)
    }
}

/// 테이블 권한 정책
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct TablePermissions {
    /// SELECT 권한
    #[serde(default)]
    pub select: Option<OperationRules>,

    /// INSERT 권한
    #[serde(default)]
    pub insert: Option<OperationRules>,

    /// UPDATE 권한
    #[serde(default)]
    pub update: Option<OperationRules>,

    /// DELETE 권한
    #[serde(default)]
    pub delete: Option<OperationRules>,
}


/// Role 요구사항
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RoleRequirement {
    /// 인증 없이 허용
    Public,

    /// 인증된 사용자만 허용
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

impl Serialize for RoleRequirement {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        match self {
            RoleRequirement::Public => serializer.serialize_str("public"),
            RoleRequirement::Authenticated => serializer.serialize_str("authenticated"),
            RoleRequirement::Role(role) => serializer.serialize_str(role),
        }
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
    pub fn get_operation(&self, op: Operation) -> Option<&OperationRules> {
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
    fn test_parse_permissions_yaml_new_format() {
        let yaml = r#"
tables:
  users:
    select:
      - roles: [authenticated]
        condition: "resource.id == request.auth.sub"
        columns: ["*"]
    insert:
      - roles: [public]
        columns: ["name", "email"]
    update:
      - roles: [authenticated]
        condition: "resource.id == request.auth.sub"
        columns: ["name", "avatar_url"]
"#;

        let policy: PermissionPolicy = serde_yaml::from_str(yaml).unwrap();

        let users = policy.tables.get("users").unwrap();
        assert!(users.select.is_some());
        assert!(users.insert.is_some());

        let select_rules = users.select.as_ref().unwrap();
        assert_eq!(select_rules.rules.len(), 1);
        assert_eq!(select_rules.rules[0].roles.len(), 1);
        assert_eq!(select_rules.rules[0].columns.as_ref().unwrap(), &vec!["*"]);
    }

    #[test]
    fn test_parse_permissions_yaml_shorthand() {
        // Shorthand format (backward compatibility)
        let yaml = r#"
tables:
  posts:
    select:
      roles: [authenticated]
      condition: "resource.owner_id == request.auth.sub"
    insert:
      roles: [public]
"#;

        let policy: PermissionPolicy = serde_yaml::from_str(yaml).unwrap();
        let posts = policy.tables.get("posts").unwrap();

        let select_rules = posts.select.as_ref().unwrap();
        assert_eq!(select_rules.rules.len(), 1); // Shorthand converts to single rule
        assert_eq!(select_rules.rules[0].roles.len(), 1);
        assert!(select_rules.rules[0].condition.is_some());
    }
}
