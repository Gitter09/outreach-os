pub mod contacts;
pub mod crypto;
pub mod db;
pub mod email_service;
pub mod gmail;
pub mod import;
pub mod oauth_html;
pub mod outlook;
pub mod settings;

pub use contacts::{ContactWithTags, CONTACT_SELECT_BASE};
pub use db::models;
pub use db::Db;
pub use email_service::{EmailService, SyncResult};

pub async fn init_core(db_path: &str) -> anyhow::Result<Db> {
    Db::new(db_path).await
}
