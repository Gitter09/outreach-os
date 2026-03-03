pub mod ai;
pub mod crypto;
pub mod db;
pub mod email_ai;
pub mod email_service;
pub mod gmail;
pub mod import;
pub mod outlook;
pub mod settings;
pub mod tracking;

pub use ai::{AiClient, AiConfig, AiProvider};
pub use db::models;
pub use db::Db;
pub use email_ai::EmailAI;
pub use email_service::{EmailService, SyncResult};

pub async fn init_core(db_path: &str) -> anyhow::Result<Db> {
    Db::new(db_path).await
}
