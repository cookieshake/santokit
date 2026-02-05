//! stk-sql: 동적 SQL 생성 라이브러리
//!
//! Schema IR을 기반으로 런타임에 SQL을 생성합니다.
//! SeaQuery를 사용하여 SQL Injection을 원천 차단합니다.
//!
//! # 모듈 구조
//!
//! - `builder`: CRUD SQL 빌더
//! - `ddl`: DDL(CREATE TABLE 등) 생성기
//! - `params`: 요청 파라미터 파싱/검증

pub mod builder;
pub mod ddl;
pub mod params;

pub use builder::{DeleteBuilder, InsertBuilder, SelectBuilder, UpdateBuilder};
pub use ddl::DdlGenerator;
pub use params::{CrudParams, WhereClause};
