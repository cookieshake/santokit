//! Schema IR (Intermediate Representation)
//!
//! Hub가 생성하고 Bridge가 사용하는 스키마의 최종 형태입니다.
//! Connection별로 그룹핑되어 저장됩니다.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};

use super::table::Table;

/// Schema IR
///
/// 특정 connection에 속한 테이블들의 집합입니다.
/// Bridge는 이 IR을 기반으로 SQL을 생성합니다.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SchemaIr {
    /// 스키마 버전 (YAML의 version 필드)
    pub version: u32,

    /// Connection 이름
    pub connection: String,

    /// 테이블 맵 (테이블 이름 -> 테이블 정의)
    pub tables: HashMap<String, Table>,
}

impl SchemaIr {
    /// 빈 IR 생성
    pub fn new(connection: String) -> Self {
        Self {
            version: 1,
            connection,
            tables: HashMap::new(),
        }
    }

    /// 테이블 추가
    pub fn add_table(&mut self, table: Table) {
        self.tables.insert(table.name.clone(), table);
    }

    /// 테이블 조회
    pub fn get_table(&self, name: &str) -> Option<&Table> {
        self.tables.get(name)
    }

    /// 테이블 존재 여부
    pub fn has_table(&self, name: &str) -> bool {
        self.tables.contains_key(name)
    }

    /// 모든 테이블 이름
    pub fn table_names(&self) -> impl Iterator<Item = &str> {
        self.tables.keys().map(|s| s.as_str())
    }

    /// 모든 테이블
    pub fn all_tables(&self) -> impl Iterator<Item = &Table> {
        self.tables.values()
    }

    /// 외래키 참조 검증
    ///
    /// 모든 외래키가 같은 connection 내의 유효한 테이블을 참조하는지 확인합니다.
    pub fn validate_references(&self) -> Vec<ReferenceError> {
        let mut errors = Vec::new();

        for table in self.tables.values() {
            for column in table.columns_with_references() {
                if let Some(ref reference) = column.references {
                    if !self.tables.contains_key(&reference.table) {
                        errors.push(ReferenceError::TableNotFound {
                            from_table: table.name.clone(),
                            from_column: column.name.clone(),
                            ref_table: reference.table.clone(),
                        });
                    }
                }
            }
        }

        errors
    }
}

/// 참조 검증 에러
#[derive(Debug, Clone)]
pub enum ReferenceError {
    TableNotFound {
        from_table: String,
        from_column: String,
        ref_table: String,
    },
}

/// 전체 프로젝트 스키마
///
/// 여러 connection의 Schema IR을 묶은 전체 스키마입니다.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ProjectSchema {
    /// Connection별 Schema IR
    pub connections: HashMap<String, SchemaIr>,
}

impl ProjectSchema {
    /// 빈 프로젝트 스키마 생성
    pub fn new() -> Self {
        Self::default()
    }

    /// 테이블이 속한 connection 찾기
    pub fn find_table_connection(&self, table_name: &str) -> Option<&str> {
        for (conn_name, ir) in &self.connections {
            if ir.has_table(table_name) {
                return Some(conn_name);
            }
        }
        None
    }

    /// 테이블 조회 (connection 자동 탐색)
    pub fn find_table(&self, table_name: &str) -> Option<&Table> {
        for ir in self.connections.values() {
            if let Some(table) = ir.get_table(table_name) {
                return Some(table);
            }
        }
        None
    }

    /// 특정 connection의 Schema IR 조회
    pub fn get_connection(&self, connection: &str) -> Option<&SchemaIr> {
        self.connections.get(connection)
    }

    /// 모든 테이블 이름 (전체 프로젝트)
    pub fn all_table_names(&self) -> impl Iterator<Item = &str> {
        self.connections
            .values()
            .flat_map(|ir| ir.table_names())
    }

    /// 전체 참조 검증
    pub fn validate_all_references(&self) -> Vec<(String, ReferenceError)> {
        let mut errors = Vec::new();

        for (conn_name, ir) in &self.connections {
            for error in ir.validate_references() {
                errors.push((conn_name.clone(), error));
            }
        }

        errors
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_schema_ir_table_operations() {
        let mut ir = SchemaIr::new("main".to_string());

        let table = Table {
            name: "users".to_string(),
            connection: "main".to_string(),
            id: super::super::table::IdColumn::default(),
            columns: vec![],
            indexes: vec![],
        };

        ir.add_table(table);

        assert!(ir.has_table("users"));
        assert!(!ir.has_table("posts"));
        assert!(ir.get_table("users").is_some());
    }

    #[test]
    fn test_project_schema_find_table() {
        let mut schema = ProjectSchema::new();

        let mut ir = SchemaIr::new("main".to_string());
        ir.add_table(Table {
            name: "users".to_string(),
            connection: "main".to_string(),
            id: super::super::table::IdColumn::default(),
            columns: vec![],
            indexes: vec![],
        });

        schema.connections.insert("main".to_string(), ir);

        assert_eq!(schema.find_table_connection("users"), Some("main"));
        assert_eq!(schema.find_table_connection("unknown"), None);
    }
}
