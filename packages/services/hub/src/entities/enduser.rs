use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "endusers")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub project: String,
    #[sea_orm(primary_key, auto_increment = false)]
    pub env: String,
    #[sea_orm(primary_key, auto_increment = false)]
    pub email: String,
    pub password: String,
    pub sub: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
