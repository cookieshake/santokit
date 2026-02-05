//! 선언 스키마(YAML) 파싱 및 IR 생성
//!
//! # 개요
//!
//! Santokit의 스키마는 `schema/*.yaml` 파일로 정의됩니다.
//! 이 모듈은 YAML을 파싱하여 내부 IR(Intermediate Representation)로 변환합니다.
//!
//! # 모듈 구조
//!
//! - `types`: 논리적 타입 정의 (string, int, bigint, etc.)
//! - `table`: 테이블 정의
//! - `column`: 컬럼 정의
//! - `ir`: Schema IR (Hub/Bridge가 사용하는 최종 형태)
//! - `parser`: YAML 파싱 로직

mod column;
mod ir;
mod parser;
mod table;
mod types;

pub use column::{Column, ColumnPrefix, Reference, ReferentialAction};
pub use ir::{ProjectSchema, SchemaIr};
pub use parser::SchemaParser;
pub use table::{IdColumn, Index, Table};
pub use types::ColumnType;
