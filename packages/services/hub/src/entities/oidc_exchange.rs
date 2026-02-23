use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "oidc_exchanges")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub exchange_code: String,
    pub project: String,
    pub env: String,
    pub provider: String,
    pub subject: String,
    pub mode: String,
    pub user_sub: Option<String>,
    pub redirect_uri: String,
    pub expires_at: String,
    pub consumed: i32,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
