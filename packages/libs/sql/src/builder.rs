//! CRUD SQL 빌더
//!
//! Schema IR과 CrudParams를 받아 SQL을 생성합니다.
//! SeaQuery를 사용하여 SQL Injection을 방지합니다.

use sea_query::{Expr, Iden, Order, PostgresQueryBuilder, Query, SelectStatement};
use serde_json::Value;
use std::collections::HashMap;

use stk_core::schema::Table;

use crate::params::{CrudParams, SortOrder, WhereClause, WhereOperator};

/// 동적 테이블/컬럼 식별자
#[derive(Debug, Clone)]
struct DynIden(String);

impl Iden for DynIden {
    fn unquoted(&self, s: &mut dyn std::fmt::Write) {
        write!(s, "{}", self.0).unwrap();
    }
}

/// SELECT 쿼리 빌더
pub struct SelectBuilder<'a> {
    table: &'a Table,
}

impl<'a> SelectBuilder<'a> {
    /// 새 빌더 생성
    pub fn new(table: &'a Table) -> Self {
        Self { table }
    }

    /// SQL 생성
    ///
    /// # Arguments
    /// * `params` - CRUD 파라미터
    /// * `extra_where` - 추가 WHERE 조건 (권한 조건)
    /// * `allowed_columns` - 허용된 컬럼 목록 (None = 모든 컬럼)
    ///
    /// # Returns
    /// (SQL 문자열, 바인딩할 값들)
    pub fn build(
        &self,
        params: &CrudParams,
        extra_where: Option<&str>,
        allowed_columns: Option<&[String]>,
    ) -> (String, Vec<Value>) {
        let mut query = Query::select();
        let table_iden = DynIden(self.table.name.clone());

        // FROM
        query.from(table_iden.clone());

        // SELECT columns
        self.build_select_columns(&mut query, params, allowed_columns);

        // WHERE
        let mut values = Vec::new();
        if let Some(where_clause) = &params.r#where {
            self.build_where(&mut query, where_clause, &mut values);
        }

        // Extra WHERE (권한 조건)
        if let Some(extra) = extra_where {
            query.and_where(Expr::cust(extra));
        }

        // ORDER BY
        if let Some(order_by) = &params.order_by {
            self.build_order_by(&mut query, order_by);
        }

        // LIMIT / OFFSET
        if let Some(limit) = params.limit {
            query.limit(limit);
        }
        if let Some(offset) = params.offset {
            query.offset(offset);
        }

        let sql = query.to_string(PostgresQueryBuilder);
        (sql, values)
    }

    fn build_select_columns(
        &self,
        query: &mut SelectStatement,
        params: &CrudParams,
        allowed_columns: Option<&[String]>,
    ) {
        let columns: Vec<&str> = match &params.select {
            Some(crate::params::SelectColumns::Columns(cols)) => {
                // 명시적 컬럼 목록 (caller가 이미 검증했음)
                cols.iter().map(|s| s.as_str()).collect()
            }
            _ => {
                // "*" 또는 None
                if let Some(allowed) = allowed_columns {
                    // allowed_columns 있으면 사용 (id는 항상 포함)
                    let mut cols = vec![self.table.id.name.as_str()];
                    cols.extend(allowed.iter().map(|s| s.as_str()));
                    cols
                } else {
                    // allowed_columns 없으면 기존 로직 (selectable_columns)
                    let mut cols = vec![self.table.id.name.as_str()];
                    cols.extend(self.table.selectable_columns().map(|c| c.name.as_str()));
                    cols
                }
            }
        };

        for col in columns {
            query.column((DynIden(self.table.name.clone()), DynIden(col.to_string())));
        }
    }

    fn build_where(
        &self,
        query: &mut SelectStatement,
        where_clause: &WhereClause,
        values: &mut Vec<Value>,
    ) {
        for (column, value) in &where_clause.0 {
            // 논리 연산자 ($and, $or) 처리는 생략 (후속 구현)
            if column.starts_with('$') {
                continue;
            }

            let col_iden = (DynIden(self.table.name.clone()), DynIden(column.clone()));

            match value {
                // 단순 equality
                Value::String(s) => {
                    query.and_where(Expr::col(col_iden).eq(s.as_str()));
                }
                Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        query.and_where(Expr::col(col_iden).eq(i));
                    } else if let Some(f) = n.as_f64() {
                        query.and_where(Expr::col(col_iden).eq(f));
                    }
                }
                Value::Bool(b) => {
                    query.and_where(Expr::col(col_iden).eq(*b));
                }
                Value::Null => {
                    query.and_where(Expr::col(col_iden).is_null());
                }
                // 연산자 객체
                Value::Object(obj) => {
                    self.build_operator_condition(query, column, obj, values);
                }
                _ => {}
            }
        }
    }

    fn build_operator_condition(
        &self,
        query: &mut SelectStatement,
        column: &str,
        obj: &serde_json::Map<String, Value>,
        _values: &mut Vec<Value>,
    ) {
        let col_iden = (DynIden(self.table.name.clone()), DynIden(column.to_string()));

        for (op_key, op_value) in obj {
            let Some(op) = WhereOperator::from_str(op_key) else {
                continue;
            };

            match op {
                WhereOperator::Eq => {
                    if let Value::String(s) = op_value {
                        query.and_where(Expr::col(col_iden.clone()).eq(s.as_str()));
                    }
                }
                WhereOperator::Ne => {
                    if let Value::String(s) = op_value {
                        query.and_where(Expr::col(col_iden.clone()).ne(s.as_str()));
                    }
                }
                WhereOperator::Gt => {
                    if let Value::Number(n) = op_value {
                        if let Some(i) = n.as_i64() {
                            query.and_where(Expr::col(col_iden.clone()).gt(i));
                        }
                    }
                }
                WhereOperator::Gte => {
                    if let Value::Number(n) = op_value {
                        if let Some(i) = n.as_i64() {
                            query.and_where(Expr::col(col_iden.clone()).gte(i));
                        }
                    }
                }
                WhereOperator::Lt => {
                    if let Value::Number(n) = op_value {
                        if let Some(i) = n.as_i64() {
                            query.and_where(Expr::col(col_iden.clone()).lt(i));
                        }
                    }
                }
                WhereOperator::Lte => {
                    if let Value::Number(n) = op_value {
                        if let Some(i) = n.as_i64() {
                            query.and_where(Expr::col(col_iden.clone()).lte(i));
                        }
                    }
                }
                WhereOperator::In => {
                    if let Value::Array(arr) = op_value {
                        let strings: Vec<String> = arr
                            .iter()
                            .filter_map(|v| v.as_str().map(|s| s.to_string()))
                            .collect();
                        if !strings.is_empty() {
                            query.and_where(Expr::col(col_iden.clone()).is_in(strings));
                        }
                    }
                }
                WhereOperator::Like => {
                    if let Value::String(s) = op_value {
                        query.and_where(Expr::col(col_iden.clone()).like(s.as_str()));
                    }
                }
                WhereOperator::IsNull => {
                    query.and_where(Expr::col(col_iden.clone()).is_null());
                }
                WhereOperator::IsNotNull => {
                    query.and_where(Expr::col(col_iden.clone()).is_not_null());
                }
                _ => {}
            }
        }
    }

    fn build_order_by(&self, query: &mut SelectStatement, order_by: &HashMap<String, SortOrder>) {
        for (column, order) in order_by {
            let col_iden = (DynIden(self.table.name.clone()), DynIden(column.clone()));
            let order = match order {
                SortOrder::Asc => Order::Asc,
                SortOrder::Desc => Order::Desc,
            };
            query.order_by(col_iden, order);
        }
    }
}

/// INSERT 쿼리 빌더
pub struct InsertBuilder<'a> {
    table: &'a Table,
}

impl<'a> InsertBuilder<'a> {
    pub fn new(table: &'a Table) -> Self {
        Self { table }
    }

    /// SQL 생성
    pub fn build(&self, data: &HashMap<String, Value>, generated_id: Option<&str>) -> String {
        let table_iden = DynIden(self.table.name.clone());
        let mut query = Query::insert();
        query.into_table(table_iden);

        // 컬럼과 값 추가
        let mut columns = Vec::new();
        let mut values = Vec::new();

        // ID 컬럼 (Bridge가 생성한 경우)
        if let Some(id) = generated_id {
            columns.push(DynIden(self.table.id.name.clone()));
            values.push(Expr::val(id).into());
        }

        // 데이터 컬럼들
        for (col, val) in data {
            columns.push(DynIden(col.clone()));
            values.push(value_to_expr(val).into());
        }

        query.columns(columns.clone());
        query.values_panic(values);

        // RETURNING
        query.returning(Query::returning().column(DynIden(self.table.id.name.clone())));

        query.to_string(PostgresQueryBuilder)
    }
}

/// UPDATE 쿼리 빌더
pub struct UpdateBuilder<'a> {
    table: &'a Table,
}

impl<'a> UpdateBuilder<'a> {
    pub fn new(table: &'a Table) -> Self {
        Self { table }
    }

    /// SQL 생성
    pub fn build(
        &self,
        data: &HashMap<String, Value>,
        where_clause: &WhereClause,
        extra_where: Option<&str>,
    ) -> String {
        let table_iden = DynIden(self.table.name.clone());
        let mut query = Query::update();
        query.table(table_iden.clone());

        // SET 절
        for (col, val) in data {
            query.value(DynIden(col.clone()), value_to_expr(val));
        }

        // WHERE 절
        for (column, value) in &where_clause.0 {
            if column.starts_with('$') {
                continue;
            }

            let col_iden = (table_iden.clone(), DynIden(column.clone()));
            match value {
                Value::String(s) => {
                    query.and_where(Expr::col(col_iden).eq(s.as_str()));
                }
                Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        query.and_where(Expr::col(col_iden).eq(i));
                    }
                }
                _ => {}
            }
        }

        // Extra WHERE (권한 조건)
        if let Some(extra) = extra_where {
            query.and_where(Expr::cust(extra));
        }

        // RETURNING
        query.returning(Query::returning().column(DynIden(self.table.id.name.clone())));

        query.to_string(PostgresQueryBuilder)
    }
}

/// DELETE 쿼리 빌더
pub struct DeleteBuilder<'a> {
    table: &'a Table,
}

impl<'a> DeleteBuilder<'a> {
    pub fn new(table: &'a Table) -> Self {
        Self { table }
    }

    /// SQL 생성
    pub fn build(&self, where_clause: &WhereClause, extra_where: Option<&str>) -> String {
        let table_iden = DynIden(self.table.name.clone());
        let mut query = Query::delete();
        query.from_table(table_iden.clone());

        // WHERE 절
        for (column, value) in &where_clause.0 {
            if column.starts_with('$') {
                continue;
            }

            let col_iden = (table_iden.clone(), DynIden(column.clone()));
            match value {
                Value::String(s) => {
                    query.and_where(Expr::col(col_iden).eq(s.as_str()));
                }
                Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        query.and_where(Expr::col(col_iden).eq(i));
                    }
                }
                _ => {}
            }
        }

        // Extra WHERE (권한 조건)
        if let Some(extra) = extra_where {
            query.and_where(Expr::cust(extra));
        }

        // RETURNING
        query.returning(Query::returning().column(DynIden(self.table.id.name.clone())));

        query.to_string(PostgresQueryBuilder)
    }
}

/// serde_json::Value를 SeaQuery Expr로 변환
fn value_to_expr(value: &Value) -> sea_query::SimpleExpr {
    match value {
        Value::Null => Expr::val(Option::<String>::None).into(),
        Value::Bool(b) => Expr::val(*b).into(),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Expr::val(i).into()
            } else if let Some(f) = n.as_f64() {
                Expr::val(f).into()
            } else {
                Expr::val(n.to_string()).into()
            }
        }
        Value::String(s) => Expr::val(s.as_str()).into(),
        Value::Array(_) | Value::Object(_) => {
            // JSON 타입으로 직렬화
            Expr::val(value.to_string()).into()
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use stk_core::schema::{IdColumn, SchemaIr};

    fn sample_schema() -> SchemaIr {
        let mut ir = SchemaIr::new("main".to_string());
        ir.add_table(Table {
            name: "users".to_string(),
            connection: "main".to_string(),
            id: IdColumn::default(),
            columns: vec![
                stk_core::schema::Column {
                    name: "email".to_string(),
                    column_type: stk_core::schema::ColumnType::String,
                    nullable: false,
                    unique: true,
                    default: None,
                    references: None,
                },
                stk_core::schema::Column {
                    name: "status".to_string(),
                    column_type: stk_core::schema::ColumnType::String,
                    nullable: false,
                    unique: false,
                    default: None,
                    references: None,
                },
            ],
            indexes: vec![],
        });
        ir
    }

    #[test]
    fn test_select_builder_basic() {
        let schema = sample_schema();
        let table = schema.get_table("users").unwrap();
        let builder = SelectBuilder::new(table);

        let params = CrudParams {
            limit: Some(10),
            ..Default::default()
        };

        let (sql, _) = builder.build(&params, None, None);
        assert!(sql.contains("SELECT"));
        assert!(sql.contains("FROM \"users\""));
        assert!(sql.contains("LIMIT 10"));
    }

    #[test]
    fn test_select_builder_with_where() {
        let schema = sample_schema();
        let table = schema.get_table("users").unwrap();
        let builder = SelectBuilder::new(table);

        let params = CrudParams {
            r#where: Some(WhereClause::empty().eq("status", Value::String("active".to_string()))),
            ..Default::default()
        };

        let (sql, _) = builder.build(&params, None, None);
        assert!(sql.contains("WHERE"));
        assert!(sql.contains("\"status\" = 'active'"));
    }

    #[test]
    fn test_insert_builder() {
        let schema = sample_schema();
        let table = schema.get_table("users").unwrap();
        let builder = InsertBuilder::new(table);

        let mut data = HashMap::new();
        data.insert("email".to_string(), Value::String("test@example.com".to_string()));
        data.insert("status".to_string(), Value::String("active".to_string()));

        let sql = builder.build(&data, Some("user_123"));
        assert!(sql.contains("INSERT INTO \"users\""));
        assert!(sql.contains("RETURNING"));
    }
}
