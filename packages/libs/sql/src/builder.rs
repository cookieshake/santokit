//! CRUD SQL 빌더
//!
//! Schema IR과 CrudParams를 받아 SQL을 생성합니다.
//! SeaQuery를 사용하여 SQL Injection을 방지합니다.

use sea_query::{Expr, Iden, Order, PostgresQueryBuilder, Query, SelectStatement};
use serde_json::Value;
use std::collections::HashMap;

use stk_core::permissions::{PermissionFilter, PermissionFilterOp};
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
        extra_filters: Option<&[PermissionFilter]>,
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
        if let Some(filters) = extra_filters {
            self.build_permission_filters(&mut query, filters);
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
        _values: &mut Vec<Value>,
    ) {
        for (column, value) in &where_clause.0 {
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
                    self.build_operator_condition(query, column, obj);
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
    ) {
        let col_iden = (
            DynIden(self.table.name.clone()),
            DynIden(column.to_string()),
        );

        for (op_key, op_value) in obj {
            let Some(op) = WhereOperator::from_str(op_key) else {
                continue;
            };

            match op {
                WhereOperator::Eq => {
                    self.build_eq_condition(query, &col_iden, op_value);
                }
                WhereOperator::Ne => {
                    self.build_ne_condition(query, &col_iden, op_value);
                }
                WhereOperator::Gt => {
                    if let Value::Number(n) = op_value {
                        if let Some(i) = n.as_i64() {
                            query.and_where(Expr::col(col_iden.clone()).gt(i));
                        } else if let Some(f) = n.as_f64() {
                            query.and_where(Expr::col(col_iden.clone()).gt(f));
                        }
                    }
                }
                WhereOperator::Gte => {
                    if let Value::Number(n) = op_value {
                        if let Some(i) = n.as_i64() {
                            query.and_where(Expr::col(col_iden.clone()).gte(i));
                        } else if let Some(f) = n.as_f64() {
                            query.and_where(Expr::col(col_iden.clone()).gte(f));
                        }
                    }
                }
                WhereOperator::Lt => {
                    if let Value::Number(n) = op_value {
                        if let Some(i) = n.as_i64() {
                            query.and_where(Expr::col(col_iden.clone()).lt(i));
                        } else if let Some(f) = n.as_f64() {
                            query.and_where(Expr::col(col_iden.clone()).lt(f));
                        }
                    }
                }
                WhereOperator::Lte => {
                    if let Value::Number(n) = op_value {
                        if let Some(i) = n.as_i64() {
                            query.and_where(Expr::col(col_iden.clone()).lte(i));
                        } else if let Some(f) = n.as_f64() {
                            query.and_where(Expr::col(col_iden.clone()).lte(f));
                        }
                    }
                }
                WhereOperator::In => {
                    if let Value::Array(arr) = op_value {
                        if let Some(values) = scalar_array_to_strings(arr) {
                            query.and_where(Expr::col(col_iden.clone()).is_in(values));
                        }
                    }
                }
                WhereOperator::NotIn => {
                    if let Value::Array(arr) = op_value {
                        if let Some(values) = scalar_array_to_strings(arr) {
                            query.and_where(Expr::col(col_iden.clone()).is_not_in(values));
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
            }
        }
    }

    fn build_eq_condition(
        &self,
        query: &mut SelectStatement,
        col_iden: &(DynIden, DynIden),
        value: &Value,
    ) {
        match value {
            Value::String(s) => {
                query.and_where(Expr::col(col_iden.clone()).eq(s.as_str()));
            }
            Value::Bool(b) => {
                query.and_where(Expr::col(col_iden.clone()).eq(*b));
            }
            Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    query.and_where(Expr::col(col_iden.clone()).eq(i));
                } else if let Some(f) = n.as_f64() {
                    query.and_where(Expr::col(col_iden.clone()).eq(f));
                }
            }
            Value::Null => {
                query.and_where(Expr::col(col_iden.clone()).is_null());
            }
            _ => {}
        }
    }

    fn build_ne_condition(
        &self,
        query: &mut SelectStatement,
        col_iden: &(DynIden, DynIden),
        value: &Value,
    ) {
        match value {
            Value::String(s) => {
                query.and_where(Expr::col(col_iden.clone()).ne(s.as_str()));
            }
            Value::Bool(b) => {
                query.and_where(Expr::col(col_iden.clone()).ne(*b));
            }
            Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    query.and_where(Expr::col(col_iden.clone()).ne(i));
                } else if let Some(f) = n.as_f64() {
                    query.and_where(Expr::col(col_iden.clone()).ne(f));
                }
            }
            Value::Null => {
                query.and_where(Expr::col(col_iden.clone()).is_not_null());
            }
            _ => {}
        }
    }

    fn build_permission_filters(&self, query: &mut SelectStatement, filters: &[PermissionFilter]) {
        for filter in filters {
            let col_iden = (
                DynIden(self.table.name.clone()),
                DynIden(filter.column.clone()),
            );
            match filter.op {
                PermissionFilterOp::Eq => self.build_eq_condition(query, &col_iden, &filter.value),
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
        query.returning(Query::returning().expr(Expr::cust("*")));

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
        extra_filters: Option<&[PermissionFilter]>,
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
            let col_iden = (table_iden.clone(), DynIden(column.clone()));
            match value {
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
                Value::Object(obj) => {
                    apply_operator_condition_to_update(&mut query, table_iden.clone(), column, obj);
                }
                _ => {}
            }
        }

        // Extra WHERE (권한 조건)
        if let Some(filters) = extra_filters {
            apply_permission_filters_to_update(&mut query, table_iden.clone(), filters);
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
    pub fn build(
        &self,
        where_clause: &WhereClause,
        extra_filters: Option<&[PermissionFilter]>,
    ) -> String {
        let table_iden = DynIden(self.table.name.clone());
        let mut query = Query::delete();
        query.from_table(table_iden.clone());

        // WHERE 절
        for (column, value) in &where_clause.0 {
            let col_iden = (table_iden.clone(), DynIden(column.clone()));
            match value {
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
                Value::Object(obj) => {
                    apply_operator_condition_to_delete(&mut query, table_iden.clone(), column, obj);
                }
                _ => {}
            }
        }

        // Extra WHERE (권한 조건)
        if let Some(filters) = extra_filters {
            apply_permission_filters_to_delete(&mut query, table_iden.clone(), filters);
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

fn scalar_array_to_strings(values: &[Value]) -> Option<Vec<String>> {
    let mut out = Vec::new();
    for value in values {
        match value {
            Value::String(s) => out.push(s.clone()),
            Value::Number(n) => out.push(n.to_string()),
            Value::Bool(b) => out.push(b.to_string()),
            _ => return None,
        }
    }
    Some(out)
}

fn apply_operator_condition_to_update(
    query: &mut sea_query::UpdateStatement,
    table_iden: DynIden,
    column: &str,
    obj: &serde_json::Map<String, Value>,
) {
    let col_iden = (table_iden, DynIden(column.to_string()));
    for (op_key, op_value) in obj {
        let Some(op) = WhereOperator::from_str(op_key) else {
            continue;
        };
        apply_where_operator_update(query, &col_iden, op, op_value);
    }
}

fn apply_operator_condition_to_delete(
    query: &mut sea_query::DeleteStatement,
    table_iden: DynIden,
    column: &str,
    obj: &serde_json::Map<String, Value>,
) {
    let col_iden = (table_iden, DynIden(column.to_string()));
    for (op_key, op_value) in obj {
        let Some(op) = WhereOperator::from_str(op_key) else {
            continue;
        };
        apply_where_operator_delete(query, &col_iden, op, op_value);
    }
}

fn apply_permission_filters_to_update(
    query: &mut sea_query::UpdateStatement,
    table_iden: DynIden,
    filters: &[PermissionFilter],
) {
    for filter in filters {
        let col_iden = (table_iden.clone(), DynIden(filter.column.clone()));
        if filter.op == PermissionFilterOp::Eq {
            apply_eq_update(query, &col_iden, &filter.value);
        }
    }
}

fn apply_permission_filters_to_delete(
    query: &mut sea_query::DeleteStatement,
    table_iden: DynIden,
    filters: &[PermissionFilter],
) {
    for filter in filters {
        let col_iden = (table_iden.clone(), DynIden(filter.column.clone()));
        if filter.op == PermissionFilterOp::Eq {
            apply_eq_delete(query, &col_iden, &filter.value);
        }
    }
}

fn apply_where_operator_update(
    query: &mut sea_query::UpdateStatement,
    col_iden: &(DynIden, DynIden),
    op: WhereOperator,
    value: &Value,
) {
    match op {
        WhereOperator::Eq => apply_eq_update(query, col_iden, value),
        WhereOperator::Ne => apply_ne_update(query, col_iden, value),
        WhereOperator::Gt => apply_numeric_update(query, col_iden, value, "gt"),
        WhereOperator::Gte => apply_numeric_update(query, col_iden, value, "gte"),
        WhereOperator::Lt => apply_numeric_update(query, col_iden, value, "lt"),
        WhereOperator::Lte => apply_numeric_update(query, col_iden, value, "lte"),
        WhereOperator::In => apply_set_update(query, col_iden, value, true),
        WhereOperator::NotIn => apply_set_update(query, col_iden, value, false),
        WhereOperator::Like => {
            if let Value::String(s) = value {
                query.and_where(Expr::col(col_iden.clone()).like(s.as_str()));
            }
        }
        WhereOperator::IsNull => {
            query.and_where(Expr::col(col_iden.clone()).is_null());
        }
        WhereOperator::IsNotNull => {
            query.and_where(Expr::col(col_iden.clone()).is_not_null());
        }
    }
}

fn apply_where_operator_delete(
    query: &mut sea_query::DeleteStatement,
    col_iden: &(DynIden, DynIden),
    op: WhereOperator,
    value: &Value,
) {
    match op {
        WhereOperator::Eq => apply_eq_delete(query, col_iden, value),
        WhereOperator::Ne => apply_ne_delete(query, col_iden, value),
        WhereOperator::Gt => apply_numeric_delete(query, col_iden, value, "gt"),
        WhereOperator::Gte => apply_numeric_delete(query, col_iden, value, "gte"),
        WhereOperator::Lt => apply_numeric_delete(query, col_iden, value, "lt"),
        WhereOperator::Lte => apply_numeric_delete(query, col_iden, value, "lte"),
        WhereOperator::In => apply_set_delete(query, col_iden, value, true),
        WhereOperator::NotIn => apply_set_delete(query, col_iden, value, false),
        WhereOperator::Like => {
            if let Value::String(s) = value {
                query.and_where(Expr::col(col_iden.clone()).like(s.as_str()));
            }
        }
        WhereOperator::IsNull => {
            query.and_where(Expr::col(col_iden.clone()).is_null());
        }
        WhereOperator::IsNotNull => {
            query.and_where(Expr::col(col_iden.clone()).is_not_null());
        }
    }
}

fn apply_eq_update(
    query: &mut sea_query::UpdateStatement,
    col_iden: &(DynIden, DynIden),
    value: &Value,
) {
    match value {
        Value::String(s) => {
            query.and_where(Expr::col(col_iden.clone()).eq(s.as_str()));
        }
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                query.and_where(Expr::col(col_iden.clone()).eq(i));
            } else if let Some(f) = n.as_f64() {
                query.and_where(Expr::col(col_iden.clone()).eq(f));
            }
        }
        Value::Bool(b) => {
            query.and_where(Expr::col(col_iden.clone()).eq(*b));
        }
        Value::Null => {
            query.and_where(Expr::col(col_iden.clone()).is_null());
        }
        _ => {}
    }
}

fn apply_ne_update(
    query: &mut sea_query::UpdateStatement,
    col_iden: &(DynIden, DynIden),
    value: &Value,
) {
    match value {
        Value::String(s) => {
            query.and_where(Expr::col(col_iden.clone()).ne(s.as_str()));
        }
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                query.and_where(Expr::col(col_iden.clone()).ne(i));
            } else if let Some(f) = n.as_f64() {
                query.and_where(Expr::col(col_iden.clone()).ne(f));
            }
        }
        Value::Bool(b) => {
            query.and_where(Expr::col(col_iden.clone()).ne(*b));
        }
        Value::Null => {
            query.and_where(Expr::col(col_iden.clone()).is_not_null());
        }
        _ => {}
    }
}

fn apply_eq_delete(
    query: &mut sea_query::DeleteStatement,
    col_iden: &(DynIden, DynIden),
    value: &Value,
) {
    match value {
        Value::String(s) => {
            query.and_where(Expr::col(col_iden.clone()).eq(s.as_str()));
        }
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                query.and_where(Expr::col(col_iden.clone()).eq(i));
            } else if let Some(f) = n.as_f64() {
                query.and_where(Expr::col(col_iden.clone()).eq(f));
            }
        }
        Value::Bool(b) => {
            query.and_where(Expr::col(col_iden.clone()).eq(*b));
        }
        Value::Null => {
            query.and_where(Expr::col(col_iden.clone()).is_null());
        }
        _ => {}
    }
}

fn apply_ne_delete(
    query: &mut sea_query::DeleteStatement,
    col_iden: &(DynIden, DynIden),
    value: &Value,
) {
    match value {
        Value::String(s) => {
            query.and_where(Expr::col(col_iden.clone()).ne(s.as_str()));
        }
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                query.and_where(Expr::col(col_iden.clone()).ne(i));
            } else if let Some(f) = n.as_f64() {
                query.and_where(Expr::col(col_iden.clone()).ne(f));
            }
        }
        Value::Bool(b) => {
            query.and_where(Expr::col(col_iden.clone()).ne(*b));
        }
        Value::Null => {
            query.and_where(Expr::col(col_iden.clone()).is_not_null());
        }
        _ => {}
    }
}

fn apply_numeric_update(
    query: &mut sea_query::UpdateStatement,
    col_iden: &(DynIden, DynIden),
    value: &Value,
    op: &str,
) {
    if let Value::Number(n) = value {
        if let Some(i) = n.as_i64() {
            match op {
                "gt" => {
                    query.and_where(Expr::col(col_iden.clone()).gt(i));
                }
                "gte" => {
                    query.and_where(Expr::col(col_iden.clone()).gte(i));
                }
                "lt" => {
                    query.and_where(Expr::col(col_iden.clone()).lt(i));
                }
                "lte" => {
                    query.and_where(Expr::col(col_iden.clone()).lte(i));
                }
                _ => {}
            }
        } else if let Some(f) = n.as_f64() {
            match op {
                "gt" => {
                    query.and_where(Expr::col(col_iden.clone()).gt(f));
                }
                "gte" => {
                    query.and_where(Expr::col(col_iden.clone()).gte(f));
                }
                "lt" => {
                    query.and_where(Expr::col(col_iden.clone()).lt(f));
                }
                "lte" => {
                    query.and_where(Expr::col(col_iden.clone()).lte(f));
                }
                _ => {}
            }
        }
    }
}

fn apply_numeric_delete(
    query: &mut sea_query::DeleteStatement,
    col_iden: &(DynIden, DynIden),
    value: &Value,
    op: &str,
) {
    if let Value::Number(n) = value {
        if let Some(i) = n.as_i64() {
            match op {
                "gt" => {
                    query.and_where(Expr::col(col_iden.clone()).gt(i));
                }
                "gte" => {
                    query.and_where(Expr::col(col_iden.clone()).gte(i));
                }
                "lt" => {
                    query.and_where(Expr::col(col_iden.clone()).lt(i));
                }
                "lte" => {
                    query.and_where(Expr::col(col_iden.clone()).lte(i));
                }
                _ => {}
            }
        } else if let Some(f) = n.as_f64() {
            match op {
                "gt" => {
                    query.and_where(Expr::col(col_iden.clone()).gt(f));
                }
                "gte" => {
                    query.and_where(Expr::col(col_iden.clone()).gte(f));
                }
                "lt" => {
                    query.and_where(Expr::col(col_iden.clone()).lt(f));
                }
                "lte" => {
                    query.and_where(Expr::col(col_iden.clone()).lte(f));
                }
                _ => {}
            }
        }
    }
}

fn apply_set_update(
    query: &mut sea_query::UpdateStatement,
    col_iden: &(DynIden, DynIden),
    value: &Value,
    is_in: bool,
) {
    if let Value::Array(arr) = value {
        if let Some(values) = scalar_array_to_strings(arr) {
            if is_in {
                query.and_where(Expr::col(col_iden.clone()).is_in(values));
            } else {
                query.and_where(Expr::col(col_iden.clone()).is_not_in(values));
            }
        }
    }
}

fn apply_set_delete(
    query: &mut sea_query::DeleteStatement,
    col_iden: &(DynIden, DynIden),
    value: &Value,
    is_in: bool,
) {
    if let Value::Array(arr) = value {
        if let Some(values) = scalar_array_to_strings(arr) {
            if is_in {
                query.and_where(Expr::col(col_iden.clone()).is_in(values));
            } else {
                query.and_where(Expr::col(col_iden.clone()).is_not_in(values));
            }
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
        data.insert(
            "email".to_string(),
            Value::String("test@example.com".to_string()),
        );
        data.insert("status".to_string(), Value::String("active".to_string()));

        let sql = builder.build(&data, Some("user_123"));
        assert!(sql.contains("INSERT INTO \"users\""));
        assert!(sql.contains("RETURNING *"));
    }
}
