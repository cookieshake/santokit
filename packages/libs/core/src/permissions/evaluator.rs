//! 권한 평가기
//!
//! 요청에 대해 권한 정책을 평가합니다.

use super::context::EvalContext;
use super::policy::{Operation, OperationPermission, PermissionPolicy, RoleRequirement};
use crate::error::{Error, Result};

/// 권한 평가 결과
#[derive(Debug, Clone)]
pub struct EvalResult {
    /// 허용 여부
    pub allowed: bool,

    /// SQL WHERE 절에 추가할 조건 (CEL → SQL 변환 결과)
    pub where_clause: Option<String>,

    /// 거부 사유 (allowed=false인 경우)
    pub reason: Option<String>,
}

impl EvalResult {
    /// 허용 결과 생성
    pub fn allow() -> Self {
        Self {
            allowed: true,
            where_clause: None,
            reason: None,
        }
    }

    /// 조건부 허용 결과 생성
    pub fn allow_with_condition(where_clause: String) -> Self {
        Self {
            allowed: true,
            where_clause: Some(where_clause),
            reason: None,
        }
    }

    /// 거부 결과 생성
    pub fn deny(reason: impl Into<String>) -> Self {
        Self {
            allowed: false,
            where_clause: None,
            reason: Some(reason.into()),
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

    /// 테이블 작업 권한 평가
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
        let op_perm = match table_perms.get_operation(op) {
            Some(perm) => perm,
            None => {
                // 작업 권한이 없으면 기본적으로 인증된 사용자만 허용
                if ctx.is_authenticated() {
                    return Ok(EvalResult::allow());
                } else {
                    return Ok(EvalResult::deny("authentication required"));
                }
            }
        };

        // Role 체크
        if !self.check_roles(&op_perm.roles, ctx) {
            return Ok(EvalResult::deny("insufficient roles"));
        }

        // CEL 조건 평가
        if let Some(condition) = &op_perm.condition {
            return self.evaluate_condition(condition, ctx);
        }

        Ok(EvalResult::allow())
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
    /// # TODO
    /// 실제 CEL 엔진 연동은 후속 구현에서 진행합니다.
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

        // "true" 조건
        if condition.trim() == "true" {
            return Ok(EvalResult::allow());
        }

        // "false" 조건
        if condition.trim() == "false" {
            return Ok(EvalResult::deny("condition evaluated to false"));
        }

        // 알 수 없는 조건은 일단 허용 (실제 CEL 엔진 연동 후 수정)
        // TODO: cel-interpreter 연동
        Ok(EvalResult::allow())
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

    /// 컬럼 접근 권한 체크
    pub fn check_column_access(
        &self,
        table: &str,
        column: &str,
        op: Operation,
        ctx: &EvalContext,
    ) -> bool {
        let table_perms = match self.policy.tables.get(table) {
            Some(perms) => perms,
            None => return true, // 정책 없으면 허용
        };

        let columns = match &table_perms.columns {
            Some(cols) => cols,
            None => return true, // 컬럼 정책 없으면 허용
        };

        match op {
            Operation::Select => columns.allows_select(column),
            Operation::Insert => columns.allows_insert(column),
            Operation::Update => columns.allows_update(column),
            Operation::Delete => true, // DELETE는 컬럼 제한 없음
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
      roles: [authenticated]
      condition: "resource.id == request.auth.sub"
    insert:
      roles: [public]
    update:
      roles: [authenticated]
      condition: "resource.id == request.auth.sub"
    delete:
      roles: [admin]
    columns:
      select: ["*", "!c_*"]
      update: ["name", "avatar_url"]
  posts:
    select:
      roles: [public]
    insert:
      roles: [authenticated]
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
    fn test_column_access() {
        let policy = sample_policy();
        let evaluator = PermissionEvaluator::new(&policy);
        let ctx = EvalContext::new();

        // select는 c_* 제외
        assert!(evaluator.check_column_access("users", "email", Operation::Select, &ctx));
        assert!(!evaluator.check_column_access("users", "c_secret", Operation::Select, &ctx));

        // update는 name, avatar_url만
        assert!(evaluator.check_column_access("users", "name", Operation::Update, &ctx));
        assert!(!evaluator.check_column_access("users", "email", Operation::Update, &ctx));
    }
}
