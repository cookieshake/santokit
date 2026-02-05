//! 권한 정책 파싱 및 CEL 평가
//!
//! # 개요
//!
//! `config/permissions.yaml`을 파싱하여 테이블/컬럼 레벨 권한을 평가합니다.
//! CEL(Common Expression Language)을 사용하여 동적 조건을 지원합니다.
//!
//! # 모듈 구조
//!
//! - `policy`: 권한 정책 정의
//! - `context`: CEL 평가 컨텍스트
//! - `evaluator`: 권한 평가기

mod context;
mod evaluator;
mod policy;

pub use context::EvalContext;
pub use evaluator::PermissionEvaluator;
pub use policy::{
    ColumnPermissions, Operation, PermissionPolicy, RoleRequirement, TablePermissions,
};
