pub mod ai;
pub mod db;
pub mod enrichment;
pub mod gmail;
pub mod import;
pub mod settings;

pub mod email_ai;

pub use ai::{AiClient, AiConfig, AiProvider};
pub use db::models;
pub use db::Db;
pub use email_ai::EmailAI;
pub use enrichment::EnrichmentEngine;

pub async fn init_core(db_path: &str) -> anyhow::Result<Db> {
    Db::new(db_path).await
}
