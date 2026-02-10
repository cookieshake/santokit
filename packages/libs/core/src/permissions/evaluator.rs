//! 권한 평가기
//!
//! 요청에 대해 권한 정책을 평가합니다.

use super::context::EvalContext;
use super::policy::{Operation, PermissionPolicy, RoleRequirement};
use crate::error::{Error, Result};
use cel_interpreter::objects::Value as CelValue;
use cel_interpreter::{Context, Program};

/// 권한 조건 필터
#[derive(Debug, Clone)]
pub struct PermissionFilter {
    pub column: String,
    pub op: PermissionFilterOp,
    pub value: serde_json::Value,
}

/// 권한 조건 연산자
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PermissionFilterOp {
    Eq,
}

/// 권한 평가 결과
#[derive(Debug, Clone)]
pub struct EvalResult {
    /// 허용 여부
    pub allowed: bool,

    /// SQL WHERE 절에 추가할 조건 (CEL → 안전한 필터 변환 결과)
    pub filters: Vec<PermissionFilter>,

    /// 거부 사유 (allowed=false인 경우)
    pub reason: Option<String>,

    /// 허용되는 컬럼 목록 (None = 기본값, Some([...]) = 명시적 목록)
    pub columns: Option<Vec<String>>,
}

impl EvalResult {
    /// 허용 결과 생성
    pub fn allow() -> Self {
        Self {
            allowed: true,
            filters: Vec::new(),
            reason: None,
            columns: None,
        }
    }

    /// 컬럼 지정 허용 결과 생성
    pub fn allow_with_columns(columns: Vec<String>) -> Self {
        Self {
            allowed: true,
            filters: Vec::new(),
            reason: None,
            columns: Some(columns),
        }
    }

    /// 조건부 허용 결과 생성
    pub fn allow_with_filter(filter: PermissionFilter) -> Self {
        Self {
            allowed: true,
            filters: vec![filter],
            reason: None,
            columns: None,
        }
    }

    /// 조건 + 컬럼 허용 결과 생성
    pub fn allow_with_filter_and_columns(filter: PermissionFilter, columns: Vec<String>) -> Self {
        Self {
            allowed: true,
            filters: vec![filter],
            reason: None,
            columns: Some(columns),
        }
    }

    /// 거부 결과 생성
    pub fn deny(reason: impl Into<String>) -> Self {
        Self {
            allowed: false,
            filters: Vec::new(),
            reason: Some(reason.into()),
            columns: None,
        }
    }
}

/// 권한 평가기
///
/// 권한 정책과 요청 컨텍스트를 기반으로 접근을 허용/거부합니다.
pub struct PermissionEvaluator<'a> {
    policy: &'a PermissionPolicy,
}

impl<'a> PermissionEvaluator<'a> {
    /// 새 평가기 생성
    pub fn new(policy: &'a PermissionPolicy) -> Self {
        Self { policy }
    }

    /// 테이블 작업 권한 평가 (First Role Match Wins)
    ///
    /// # Arguments
    /// * `table` - 테이블 이름
    /// * `op` - 작업 타입 (select, insert, update, delete)
    /// * `ctx` - 평가 컨텍스트
    pub fn evaluate(&self, table: &str, op: Operation, ctx: &EvalContext) -> Result<EvalResult> {
        // 테이블 권한 조회
        let table_perms = match self.policy.tables.get(table) {
            Some(perms) => perms,
            None => return Ok(EvalResult::deny("no matching permission rule")),
        };

        // 작업별 권한 조회
        let op_rules = match table_perms.get_operation(op) {
            Some(rules) => rules,
            None => return Ok(EvalResult::deny("no matching permission rule")),
        };

        // First Role Match Wins: 규칙 순회
        for rule in &op_rules.rules {
            // Role 체크
            if !self.check_roles(&rule.roles, ctx) {
                continue; // 다음 규칙으로
            }

            // 매칭! 조건 평가
            if let Some(condition) = &rule.condition {
                // 조건 평가 후 컬럼 병합
                let mut result = self.evaluate_condition(condition, ctx)?;
                if result.allowed {
                    result.columns = rule.columns.clone();
                }
                return Ok(result);
            } else {
                // 조건 없음 → 즉시 허용 + 컬럼
                return Ok(if let Some(cols) = &rule.columns {
                    EvalResult::allow_with_columns(cols.clone())
                } else {
                    EvalResult::allow()
                });
            }
        }

        // 매칭되는 규칙 없음 → 거부
        Ok(EvalResult::deny("no matching permission rule"))
    }

    /// Role 체크
    fn check_roles(&self, required: &[RoleRequirement], ctx: &EvalContext) -> bool {
        if required.is_empty() {
            return true;
        }

        for req in required {
            match req {
                RoleRequirement::Public => return true,
                RoleRequirement::Authenticated => {
                    if ctx.is_end_user_authenticated() {
                        return true;
                    }
                }
                RoleRequirement::Role(role) => {
                    if ctx.has_role(role) {
                        return true;
                    }
                }
            }
        }

        false
    }

    /// CEL 조건 평가
    ///
    /// 현재는 간단한 패턴만 지원합니다.
    fn evaluate_condition(&self, condition: &str, ctx: &EvalContext) -> Result<EvalResult> {
        if condition.contains("resource.") {
            if let Some(filter) = self.parse_resource_eq_filter(condition, ctx)? {
                return Ok(EvalResult::allow_with_filter(filter));
            }
            return Err(Error::CelExpression {
                message: "unsupported resource-based condition (only simple equality is supported)"
                    .to_string(),
            });
        }

        let allowed = eval_cel_bool(condition, ctx)?;
        if allowed {
            Ok(EvalResult::allow())
        } else {
            Ok(EvalResult::deny("condition evaluated to false"))
        }
    }

    fn parse_resource_eq_filter(
        &self,
        condition: &str,
        ctx: &EvalContext,
    ) -> Result<Option<PermissionFilter>> {
        let normalized = condition.trim();
        let Some((left, right)) = normalized.split_once("==") else {
            return Ok(None);
        };

        let left = left.trim();
        let right = right.trim();

        if let Some(column) = Self::parse_resource_column(left) {
            let value = Self::parse_condition_value(right, ctx)?;
            return Ok(Some(PermissionFilter {
                column,
                op: PermissionFilterOp::Eq,
                value,
            }));
        }

        if let Some(column) = Self::parse_resource_column(right) {
            let value = Self::parse_condition_value(left, ctx)?;
            return Ok(Some(PermissionFilter {
                column,
                op: PermissionFilterOp::Eq,
                value,
            }));
        }

        Ok(None)
    }

    fn parse_resource_column(token: &str) -> Option<String> {
        let column = token.strip_prefix("resource.")?;
        if column.is_empty() {
            return None;
        }
        if !column
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
        {
            return None;
        }
        Some(column.to_string())
    }

    fn parse_condition_value(token: &str, ctx: &EvalContext) -> Result<serde_json::Value> {
        let token = token.trim();

        if token == "request.auth.sub" {
            let sub = ctx.auth.sub.as_deref().ok_or_else(|| Error::AccessDenied {
                reason: "authentication required for condition evaluation".to_string(),
            })?;
            return Ok(serde_json::Value::String(sub.to_string()));
        }

        if token.eq_ignore_ascii_case("null") {
            return Ok(serde_json::Value::Null);
        }

        if token.eq_ignore_ascii_case("true") {
            return Ok(serde_json::Value::Bool(true));
        }

        if token.eq_ignore_ascii_case("false") {
            return Ok(serde_json::Value::Bool(false));
        }

        if token.starts_with('"') && token.ends_with('"') && token.len() >= 2 {
            return Ok(serde_json::Value::String(
                token[1..token.len() - 1].to_string(),
            ));
        }

        if let Ok(n) = token.parse::<i64>() {
            return Ok(serde_json::Value::Number(n.into()));
        }

        if let Ok(n) = token.parse::<f64>() {
            if let Some(num) = serde_json::Number::from_f64(n) {
                return Ok(serde_json::Value::Number(num));
            }
        }

        Err(Error::CelExpression {
            message: format!(
                "unsupported value expression in resource condition: {}",
                token
            ),
        })
    }

    /// 컬럼 목록 결정
    ///
    /// # Arguments
    /// * `eval_result` - evaluate() 결과
    ///
    /// # Returns
    /// * `None` - 모든 컬럼 허용
    /// * `Some([...])` - 명시적 컬럼 목록
    pub fn resolve_columns(&self, eval_result: &EvalResult) -> Option<Vec<String>> {
        match &eval_result.columns {
            Some(cols) if cols == &["*"] => None, // 모든 컬럼
            Some(cols) => Some(cols.clone()),     // 명시 목록
            None => None,                         // 모든 컬럼
        }
    }
}

fn eval_cel_bool(condition: &str, ctx: &EvalContext) -> Result<bool> {
    let mut cel_ctx = Context::default();
    let vars = ctx.to_cel_variables();
    for (name, value) in vars {
        cel_ctx.add_variable_from_value(name, json_to_cel(value));
    }

    let program = Program::compile(condition).map_err(|e| Error::CelExpression {
        message: e.to_string(),
    })?;

    let result = program
        .execute(&cel_ctx)
        .map_err(|e| Error::CelExpression {
            message: e.to_string(),
        })?;

    match result {
        CelValue::Bool(b) => Ok(b),
        _ => Err(Error::CelExpression {
            message: "condition did not evaluate to bool".to_string(),
        }),
    }
}

fn json_to_cel(value: serde_json::Value) -> CelValue {
    match value {
        serde_json::Value::Null => CelValue::Null,
        serde_json::Value::Bool(b) => CelValue::Bool(b),
        serde_json::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                CelValue::Int(i)
            } else if let Some(u) = n.as_u64() {
                CelValue::UInt(u)
            } else if let Some(f) = n.as_f64() {
                CelValue::Float(f)
            } else {
                CelValue::Null
            }
        }
        serde_json::Value::String(s) => CelValue::String(s.into()),
        serde_json::Value::Array(arr) => {
            let values = arr.into_iter().map(json_to_cel).collect::<Vec<_>>();
            CelValue::List(std::sync::Arc::new(values))
        }
        serde_json::Value::Object(map) => {
            let mut obj = std::collections::HashMap::new();
            for (k, v) in map {
                obj.insert(cel_interpreter::objects::Key::from(k), json_to_cel(v));
            }
            CelValue::Map(cel_interpreter::objects::Map {
                map: std::sync::Arc::new(obj),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::permissions::context::{AuthContext, PrincipalType};

    fn sample_policy() -> PermissionPolicy {
        let yaml = r#"
tables:
  users:
    select:
      - roles: [admin]
        columns: ["*"]
      - roles: [authenticated]
        condition: "resource.id == request.auth.sub"
        columns: ["id", "name", "email"]
    insert:
      - roles: [public]
        columns: ["name", "email"]
    update:
      - roles: [authenticated]
        condition: "resource.id == request.auth.sub"
        columns: ["name", "avatar_url"]
    delete:
      - roles: [admin]
  posts:
    select:
      - roles: [public]
    insert:
      - roles: [authenticated]
"#;
        serde_yaml::from_str(yaml).unwrap()
    }

    #[test]
    fn test_public_access() {
        let policy = sample_policy();
        let evaluator = PermissionEvaluator::new(&policy);
        let ctx = EvalContext::new(); // 미인증

        // posts.select는 public
        let result = evaluator
            .evaluate("posts", Operation::Select, &ctx)
            .unwrap();
        assert!(result.allowed);

        // users.insert는 public
        let result = evaluator
            .evaluate("users", Operation::Insert, &ctx)
            .unwrap();
        assert!(result.allowed);
    }

    #[test]
    fn test_authenticated_access() {
        let policy = sample_policy();
        let evaluator = PermissionEvaluator::new(&policy);

        let ctx = EvalContext::new().with_auth(AuthContext::new("user_123".to_string(), vec![]));

        // users.select는 authenticated + condition
        let result = evaluator
            .evaluate("users", Operation::Select, &ctx)
            .unwrap();
        assert!(result.allowed);
        assert_eq!(result.filters.len(), 1);
        assert_eq!(result.filters[0].column, "id");
        assert_eq!(
            result.filters[0].value,
            serde_json::Value::String("user_123".to_string())
        );
    }

    #[test]
    fn test_role_based_access() {
        let policy = sample_policy();
        let evaluator = PermissionEvaluator::new(&policy);

        // admin 없이 delete 시도
        let ctx = EvalContext::new().with_auth(AuthContext::new(
            "user_123".to_string(),
            vec!["writer".to_string()],
        ));
        let result = evaluator
            .evaluate("users", Operation::Delete, &ctx)
            .unwrap();
        assert!(!result.allowed);

        // admin으로 delete 시도
        let ctx = EvalContext::new().with_auth(AuthContext::new(
            "user_123".to_string(),
            vec!["admin".to_string()],
        ));
        let result = evaluator
            .evaluate("users", Operation::Delete, &ctx)
            .unwrap();
        assert!(result.allowed);
    }

    #[test]
    fn test_resolve_columns() {
        let policy = sample_policy();
        let evaluator = PermissionEvaluator::new(&policy);

        // columns = ["*"] → None (모든 컬럼)
        let eval_result = EvalResult::allow_with_columns(vec!["*".to_string()]);
        let resolved = evaluator.resolve_columns(&eval_result);
        assert_eq!(resolved, None);

        // columns = ["name", "email"] → 명시적 목록
        let eval_result =
            EvalResult::allow_with_columns(vec!["name".to_string(), "email".to_string()]);
        let resolved = evaluator.resolve_columns(&eval_result);
        assert_eq!(
            resolved,
            Some(
                vec!["name", "email"]
                    .iter()
                    .map(|s| s.to_string())
                    .collect()
            )
        );

        // columns = None → None (모든 컬럼)
        let eval_result = EvalResult::allow();
        let resolved = evaluator.resolve_columns(&eval_result);
        assert_eq!(resolved, None);
    }

    #[test]
    fn test_first_role_match_wins() {
        let policy = sample_policy();
        let evaluator = PermissionEvaluator::new(&policy);

        // admin 매칭 → 첫 번째 규칙 (모든 컬럼)
        let ctx = EvalContext::new().with_auth(AuthContext::new(
            "user_123".to_string(),
            vec!["admin".to_string()],
        ));
        let result = evaluator
            .evaluate("users", Operation::Select, &ctx)
            .unwrap();
        assert!(result.allowed);
        assert_eq!(result.columns, Some(vec!["*".to_string()]));
        assert_eq!(evaluator.resolve_columns(&result), None); // "*" resolves to None

        // authenticated (non-admin) 매칭 → 두 번째 규칙 (제한된 컬럼)
        let ctx = EvalContext::new().with_auth(AuthContext::new("user_456".to_string(), vec![]));
        let result = evaluator
            .evaluate("users", Operation::Select, &ctx)
            .unwrap();
        assert!(result.allowed);
        assert_eq!(
            result.columns,
            Some(
                vec!["id", "name", "email"]
                    .iter()
                    .map(|s| s.to_string())
                    .collect::<Vec<_>>()
            )
        );
    }

    #[test]
    fn test_no_matching_policy_is_denied() {
        let policy = sample_policy();
        let evaluator = PermissionEvaluator::new(&policy);

        let ctx = EvalContext::new().with_auth(AuthContext::new(
            "user_123".to_string(),
            vec!["admin".to_string()],
        ));
        let result = evaluator
            .evaluate("unknown_table", Operation::Select, &ctx)
            .unwrap();
        assert!(!result.allowed);
        assert_eq!(
            result.reason,
            Some("no matching permission rule".to_string())
        );
    }

    #[test]
    fn test_authenticated_role_requires_end_user() {
        let policy = sample_policy();
        let evaluator = PermissionEvaluator::new(&policy);

        let api_key_ctx = EvalContext::new().with_auth(AuthContext {
            sub: Some("key_123".to_string()),
            roles: vec![],
            project_id: None,
            env_id: None,
            principal_type: PrincipalType::ApiKey,
        });
        let result = evaluator
            .evaluate("users", Operation::Select, &api_key_ctx)
            .unwrap();
        assert!(!result.allowed);

        let end_user_ctx =
            EvalContext::new().with_auth(AuthContext::end_user("user_123".to_string(), vec![]));
        let result = evaluator
            .evaluate("users", Operation::Select, &end_user_ctx)
            .unwrap();
        assert!(result.allowed);
    }

    #[test]
    fn test_resource_literal_condition_to_filter() {
        let policy: PermissionPolicy = serde_yaml::from_str(
            r#"
tables:
  posts:
    select:
      - roles: [public]
        condition: "resource.status == \"active\""
"#,
        )
        .unwrap();
        let evaluator = PermissionEvaluator::new(&policy);

        let result = evaluator
            .evaluate("posts", Operation::Select, &EvalContext::new())
            .unwrap();
        assert!(result.allowed);
        assert_eq!(result.filters.len(), 1);
        assert_eq!(result.filters[0].column, "status");
        assert_eq!(
            result.filters[0].value,
            serde_json::Value::String("active".to_string())
        );
    }

    #[test]
    fn test_resource_condition_unsupported_operator() {
        let policy: PermissionPolicy = serde_yaml::from_str(
            r#"
tables:
  posts:
    select:
      - roles: [public]
        condition: "resource.status != \"deleted\""
"#,
        )
        .unwrap();
        let evaluator = PermissionEvaluator::new(&policy);

        let result = evaluator.evaluate("posts", Operation::Select, &EvalContext::new());
        assert!(result.is_err());
    }
}
