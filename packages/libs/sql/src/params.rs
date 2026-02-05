//! CRUD 요청 파라미터
//!
//! `/call` API의 `params` 필드를 파싱하고 검증합니다.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// CRUD 요청 파라미터
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct CrudParams {
    /// WHERE 조건
    #[serde(default)]
    pub r#where: Option<WhereClause>,

    /// SELECT할 컬럼 목록 (기본: "*")
    #[serde(default)]
    pub select: Option<SelectColumns>,

    /// 관계 로드 (FK 기반)
    #[serde(default)]
    pub expand: Option<Vec<String>>,

    /// 정렬
    #[serde(default)]
    pub order_by: Option<HashMap<String, SortOrder>>,

    /// 제한
    #[serde(default)]
    pub limit: Option<u64>,

    /// 오프셋
    #[serde(default)]
    pub offset: Option<u64>,

    /// INSERT/UPDATE 데이터
    #[serde(default)]
    pub data: Option<HashMap<String, Value>>,
}

/// SELECT 컬럼 지정
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SelectColumns {
    /// 모든 컬럼
    All,
    /// 특정 컬럼 목록
    Columns(Vec<String>),
}

impl Default for SelectColumns {
    fn default() -> Self {
        SelectColumns::All
    }
}

/// 정렬 순서
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SortOrder {
    Asc,
    Desc,
}

/// WHERE 조건
///
/// JSON 객체로 표현되며, 다양한 연산자를 지원합니다.
///
/// # 예시
///
/// ```json
/// { "status": "active" }                    // status = 'active'
/// { "age": { "$gt": 18 } }                  // age > 18
/// { "tags": { "$in": ["a", "b"] } }         // tags IN ('a', 'b')
/// { "$and": [{ "a": 1 }, { "b": 2 }] }      // a = 1 AND b = 2
/// ```
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(transparent)]
pub struct WhereClause(pub HashMap<String, Value>);

impl WhereClause {
    /// 빈 WHERE 절
    pub fn empty() -> Self {
        Self(HashMap::new())
    }

    /// WHERE 조건이 비어있는지
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// 단순 equality 조건 추가
    pub fn eq(mut self, column: impl Into<String>, value: Value) -> Self {
        self.0.insert(column.into(), value);
        self
    }

    /// 조건 파싱 및 검증
    ///
    /// Schema IR의 컬럼 정보와 대조하여 유효성을 검사합니다.
    pub fn validate(&self, allowed_columns: &[&str]) -> Result<(), WhereValidationError> {
        for key in self.0.keys() {
            // 논리 연산자는 스킵
            if key.starts_with('$') {
                continue;
            }

            if !allowed_columns.contains(&key.as_str()) {
                return Err(WhereValidationError::UnknownColumn(key.clone()));
            }
        }

        Ok(())
    }
}

/// WHERE 검증 에러
#[derive(Debug, Clone, thiserror::Error)]
pub enum WhereValidationError {
    #[error("unknown column: {0}")]
    UnknownColumn(String),

    #[error("invalid operator: {0}")]
    InvalidOperator(String),

    #[error("type mismatch for column {column}: expected {expected}")]
    TypeMismatch { column: String, expected: String },
}

/// WHERE 조건 연산자
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WhereOperator {
    /// 같음 (기본)
    Eq,
    /// 같지 않음
    Ne,
    /// 보다 큼
    Gt,
    /// 보다 크거나 같음
    Gte,
    /// 보다 작음
    Lt,
    /// 보다 작거나 같음
    Lte,
    /// 포함 (IN)
    In,
    /// 미포함 (NOT IN)
    NotIn,
    /// LIKE 패턴
    Like,
    /// IS NULL
    IsNull,
    /// IS NOT NULL
    IsNotNull,
}

impl WhereOperator {
    /// 문자열에서 파싱 ($gt, $in 등)
    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "$eq" => Some(WhereOperator::Eq),
            "$ne" => Some(WhereOperator::Ne),
            "$gt" => Some(WhereOperator::Gt),
            "$gte" => Some(WhereOperator::Gte),
            "$lt" => Some(WhereOperator::Lt),
            "$lte" => Some(WhereOperator::Lte),
            "$in" => Some(WhereOperator::In),
            "$nin" | "$notIn" => Some(WhereOperator::NotIn),
            "$like" => Some(WhereOperator::Like),
            "$null" | "$isNull" => Some(WhereOperator::IsNull),
            "$notNull" | "$isNotNull" => Some(WhereOperator::IsNotNull),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_where_clause_validation() {
        let where_clause = WhereClause::empty()
            .eq("status", Value::String("active".to_string()))
            .eq("age", Value::Number(25.into()));

        let allowed = vec!["status", "age", "name"];
        assert!(where_clause.validate(&allowed).is_ok());

        let where_clause = WhereClause::empty()
            .eq("unknown_col", Value::String("value".to_string()));
        assert!(where_clause.validate(&allowed).is_err());
    }

    #[test]
    fn test_where_operator_parsing() {
        assert_eq!(WhereOperator::from_str("$gt"), Some(WhereOperator::Gt));
        assert_eq!(WhereOperator::from_str("$in"), Some(WhereOperator::In));
        assert_eq!(WhereOperator::from_str("$unknown"), None);
    }

    #[test]
    fn test_params_deserialization() {
        let json = r#"{
            "where": { "status": "active" },
            "select": ["id", "name"],
            "order_by": { "created_at": "desc" },
            "limit": 10
        }"#;

        let params: CrudParams = serde_json::from_str(json).unwrap();
        assert!(params.r#where.is_some());
        assert!(params.limit == Some(10));
    }
}
