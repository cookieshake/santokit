//! 권한 평가기
//!
//! 요청에 대해 권한 정책을 평가합니다.

use super::context::EvalContext;
use super::policy::{Operation, PermissionPolicy, RoleRequirement};
use crate::error::{Error, Result};
use cel_interpreter::{Context, Program};
use cel_interpreter::objects::Value as CelValue;

/// 권한 평가 결과
#[derive(Debug, Clone)]
pub struct EvalResult {
    /// 허용 여부
    pub allowed: bool,

    /// SQL WHERE 절에 추가할 조건 (CEL → SQL 변환 결과)
    pub where_clause: Option<String>,

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
            where_clause: None,
            reason: None,
            columns: None,
        }
    }

    /// 컬럼 지정 허용 결과 생성
    pub fn allow_with_columns(columns: Vec<String>) -> Self {
        Self {
            allowed: true,
            where_clause: None,
            reason: None,
            columns: Some(columns),
        }
    }

    /// 조건부 허용 결과 생성
    pub fn allow_with_condition(where_clause: String) -> Self {
        Self {
            allowed: true,
            where_clause: Some(where_clause),
            reason: None,
            columns: None,
        }
    }

    /// 조건 + 컬럼 허용 결과 생성
    pub fn allow_with_condition_and_columns(where_clause: String, columns: Vec<String>) -> Self {
        Self {
            allowed: true,
            where_clause: Some(where_clause),
            reason: None,
            columns: Some(columns),
        }
    }

    /// 거부 결과 생성
    pub fn deny(reason: impl Into<String>) -> Self {
        Self {
            allowed: false,
            where_clause: None,
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
            None => {
                // 정책이 없으면 기본적으로 인증된 사용자만 허용
                if ctx.is_authenticated() {
                    return Ok(EvalResult::allow());
                } else {
                    return Ok(EvalResult::deny("authentication required"));
                }
            }
        };

        // 작업별 권한 조회
        let op_rules = match table_perms.get_operation(op) {
            Some(rules) => rules,
            None => {
                // 작업 권한이 없으면 기본적으로 인증된 사용자만 허용
                if ctx.is_authenticated() {
                    return Ok(EvalResult::allow());
                } else {
                    return Ok(EvalResult::deny("authentication required"));
                }
            }
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
                    if ctx.is_authenticated() {
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
        // 간단한 owner 체크 패턴 인식
        // "resource.id == request.auth.sub"
        // "resource.user_id == request.auth.sub"

        if condition.contains("request.auth.sub") {
            let sub = ctx.auth.sub.as_deref().ok_or_else(|| Error::AccessDenied {
                reason: "authentication required for condition evaluation".to_string(),
            })?;

            // 패턴에서 컬럼 이름 추출
            let column = self.extract_owner_column(condition);

            if let Some(col) = column {
                // SQL WHERE 절 생성
                let where_clause = format!("{} = '{}'", col, sub);
                return Ok(EvalResult::allow_with_condition(where_clause));
            }
        }

        // resource 기반 조건은 지원하지 않음
        if condition.contains("resource.") {
            return Err(Error::CelExpression {
                message: "resource-based conditions require SQL translation".to_string(),
            });
        }

        let allowed = eval_cel_bool(condition, ctx)?;
        if allowed {
            Ok(EvalResult::allow())
        } else {
            Ok(EvalResult::deny("condition evaluated to false"))
        }
    }

    /// Owner 체크 조건에서 컬럼 이름 추출
    fn extract_owner_column(&self, condition: &str) -> Option<String> {
        // "resource.{column} == request.auth.sub" 패턴 인식
        let pattern = "resource.";
        if let Some(start) = condition.find(pattern) {
            let rest = &condition[start + pattern.len()..];
            let end = rest.find(|c: char| !c.is_alphanumeric() && c != '_');
            let column = match end {
                Some(idx) => &rest[..idx],
                None => rest,
            };
            return Some(column.to_string());
        }

        None
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
            Some(cols) => Some(cols.clone()),      // 명시 목록
            None => None,                          // 모든 컬럼
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

    let result = program.execute(&cel_ctx).map_err(|e| Error::CelExpression {
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
    use crate::permissions::context::AuthContext;

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
        let result = evaluator.evaluate("posts", Operation::Select, &ctx).unwrap();
        assert!(result.allowed);

        // users.insert는 public
        let result = evaluator.evaluate("users", Operation::Insert, &ctx).unwrap();
        assert!(result.allowed);
    }

    #[test]
    fn test_authenticated_access() {
        let policy = sample_policy();
        let evaluator = PermissionEvaluator::new(&policy);

        let ctx = EvalContext::new().with_auth(AuthContext::new(
            "user_123".to_string(),
            vec![],
        ));

        // users.select는 authenticated + condition
        let result = evaluator.evaluate("users", Operation::Select, &ctx).unwrap();
        assert!(result.allowed);
        assert!(result.where_clause.is_some());
        assert!(result.where_clause.unwrap().contains("user_123"));
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
        let result = evaluator.evaluate("users", Operation::Delete, &ctx).unwrap();
        assert!(!result.allowed);

        // admin으로 delete 시도
        let ctx = EvalContext::new().with_auth(AuthContext::new(
            "user_123".to_string(),
            vec!["admin".to_string()],
        ));
        let result = evaluator.evaluate("users", Operation::Delete, &ctx).unwrap();
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
        let eval_result = EvalResult::allow_with_columns(vec!["name".to_string(), "email".to_string()]);
        let resolved = evaluator.resolve_columns(&eval_result);
        assert_eq!(resolved, Some(vec!["name", "email"].iter().map(|s| s.to_string()).collect()));

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
        let result = evaluator.evaluate("users", Operation::Select, &ctx).unwrap();
        assert!(result.allowed);
        assert_eq!(result.columns, Some(vec!["*".to_string()]));
        assert_eq!(evaluator.resolve_columns(&result), None); // "*" resolves to None

        // authenticated (non-admin) 매칭 → 두 번째 규칙 (제한된 컬럼)
        let ctx = EvalContext::new().with_auth(AuthContext::new(
            "user_456".to_string(),
            vec![],
        ));
        let result = evaluator.evaluate("users", Operation::Select, &ctx).unwrap();
        assert!(result.allowed);
        assert_eq!(result.columns, Some(vec!["id", "name", "email"].iter().map(|s| s.to_string()).collect::<Vec<_>>()));
    }
}
