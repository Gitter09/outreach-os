use anyhow::{Context, Result};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePool, SqlitePoolOptions};
use std::path::Path;
use std::str::FromStr;

#[derive(Clone)]
pub struct Db {
    pool: SqlitePool,
}

impl Db {
    pub async fn new(db_path: &str) -> Result<Self> {
        // Retrieve (or generate) the 256-bit DB encryption key from OS keychain
        let hex_key = crate::crypto::get_or_create_db_key()
            .context("Failed to obtain database encryption key from keychain")?;

        // Try to open with encryption. If the file exists but isn't encrypted
        // (legacy plaintext), SQLCipher returns an error — we handle that below.
        let pool = try_open_encrypted(db_path, &hex_key).await;

        let pool = match pool {
            Ok(p) => p,
            Err(_) => {
                // If the DB file exists, it's a legacy plaintext database.
                // Migrate it to an encrypted copy then reopen encrypted.
                if Path::new(db_path).exists() {
                    migrate_plaintext_to_encrypted(db_path, &hex_key)
                        .await
                        .context("Failed to migrate existing database to encrypted format")?;
                }
                // Now open (or create fresh) the encrypted database
                try_open_encrypted(db_path, &hex_key)
                    .await
                    .context("Failed to open encrypted database after migration")?
            }
        };

        // Run migrations
        sqlx::migrate!("./migrations").run(&pool).await?;

        Ok(Self { pool })
    }

    pub fn pool(&self) -> &SqlitePool {
        &self.pool
    }
}

/// Opens (or creates) a SQLCipher-encrypted database at `db_path` using `hex_key`.
async fn try_open_encrypted(db_path: &str, hex_key: &str) -> Result<SqlitePool> {
    // Build the connection URL. SQLCipher reads the key from the ?key= parameter
    // when using the sqlx sqlcipher feature, applied as PRAGMA key before anything else.
    let uri = format!("sqlite:{}?mode=rwc", db_path);

    let connect_opts = SqliteConnectOptions::from_str(&uri)?
        .pragma("key", format!("\"x'{}'\"", hex_key))
        // SQLCipher 4 defaults — explicit for forward compatibility
        .pragma("cipher_page_size", "4096")
        .pragma("kdf_iter", "256000")
        .pragma("cipher_hmac_algorithm", "HMAC_SHA512")
        .pragma("cipher_kdf_algorithm", "PBKDF2_HMAC_SHA512");

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(connect_opts)
        .await?;

    // Lightweight read to confirm the key is correct (will fail if wrong key)
    sqlx::query("SELECT count(*) FROM sqlite_master")
        .execute(&pool)
        .await?;

    Ok(pool)
}

/// Migrates a legacy plaintext SQLite database to an encrypted SQLCipher database.
/// Uses SQLCipher's built-in `sqlcipher_export()` function to re-encrypt in-place.
async fn migrate_plaintext_to_encrypted(db_path: &str, hex_key: &str) -> Result<()> {
    let temp_path = format!("{}.encrypted_tmp", db_path);

    // Open the existing plaintext database (no key)
    let plain_uri = format!("sqlite:{}?mode=ro", db_path);
    let plain_opts = SqliteConnectOptions::from_str(&plain_uri)?;
    let plain_pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(plain_opts)
        .await
        .context("Failed to open existing plaintext database for migration")?;

    // Attach a new encrypted database and export everything into it
    let attach_sql = format!(
        "ATTACH DATABASE '{}' AS encrypted KEY \"x'{}'\";",
        temp_path, hex_key
    );
    sqlx::query(&attach_sql).execute(&plain_pool).await?;
    sqlx::query("SELECT sqlcipher_export('encrypted')")
        .execute(&plain_pool)
        .await?;
    sqlx::query("DETACH DATABASE encrypted")
        .execute(&plain_pool)
        .await?;

    // Close the plaintext pool
    plain_pool.close().await;

    // Replace the plaintext file with the encrypted copy
    std::fs::rename(&temp_path, db_path)
        .context("Failed to replace plaintext database with encrypted version")?;

    tracing::info!("Database successfully migrated to encrypted format");
    Ok(())
}

pub mod models {
    use chrono::{DateTime, Utc};
    use serde::{Deserialize, Serialize};

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
    pub struct Contact {
        pub id: String,
        pub company_id: Option<String>,
        pub first_name: String,
        pub last_name: String,
        pub email: Option<String>,
        pub linkedin_url: Option<String>,

        // New fields for Contact Detail Redesign
        pub title: Option<String>,
        pub company: Option<String>,
        pub location: Option<String>,
        pub company_website: Option<String>,

        // Legacy status field (text), optional or deprecated
        pub status: Option<String>,

        // New Status System
        pub status_id: Option<String>,
        pub status_label: Option<String>, // Join result
        pub status_color: Option<String>, // Join result

        pub intelligence_summary: Option<String>,

        // Dates & Cadence
        pub last_interaction_at: Option<DateTime<Utc>>, // kept for history
        pub last_contacted_date: Option<DateTime<Utc>>, // explicit field
        pub next_contact_date: Option<DateTime<Utc>>,
        pub effective_next_date: Option<DateTime<Utc>>,
        pub next_contact_event: Option<String>,
        pub cadence_stage: Option<i32>,

        pub created_at: DateTime<Utc>,
        pub updated_at: DateTime<Utc>,
    }

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
    pub struct Status {
        pub id: String,
        pub label: String,
        pub color: String,
        pub is_default: bool,
        pub position: i32,
    }

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow)]
    pub struct Company {
        pub id: String,
        pub name: String,
        pub domain: Option<String>,
        pub industry: Option<String>,
        pub description: Option<String>,
        pub created_at: DateTime<Utc>,
        pub updated_at: DateTime<Utc>,
    }

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
    pub struct Tag {
        pub id: String,
        pub name: String,
        pub color: String,
        pub created_at: DateTime<Utc>,
    }

    // Email CRM Models
    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
    pub struct EmailAccount {
        pub id: String,
        pub provider: String, // 'gmail', 'outlook'
        pub email: String,
        #[serde(skip)]
        pub access_token: String,
        #[serde(skip)]
        pub refresh_token: Option<String>,
        pub expires_at: Option<i64>,
        pub last_synced_at: Option<DateTime<Utc>>,
        pub created_at: DateTime<Utc>,
        pub updated_at: DateTime<Utc>,
    }

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
    pub struct EmailThread {
        pub id: String,
        pub contact_id: String,
        pub account_id: String,
        pub subject: Option<String>,
        pub last_message_at: Option<DateTime<Utc>>,
        pub created_at: DateTime<Utc>,
        pub updated_at: DateTime<Utc>,
    }

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
    pub struct EmailMessage {
        pub id: String,
        pub thread_id: String,
        pub from_email: String,
        pub to_email: String,
        pub subject: Option<String>,
        pub body: Option<String>,
        pub html_body: Option<String>,
        pub sent_at: Option<DateTime<Utc>>,
        pub status: Option<String>, // 'received', 'sent', 'draft'
        pub provider_message_id: Option<String>,
        pub manually_assigned: Option<i32>,
        pub created_at: DateTime<Utc>,
    }

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
    pub struct ScheduledEmail {
        pub id: String,
        pub contact_id: String,
        pub account_id: String,
        pub subject: String,
        pub body: String,
        pub scheduled_at: DateTime<Utc>,
        pub status: String,
        pub error_message: Option<String>,
        pub created_at: DateTime<Utc>,
    }

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
    pub struct ContactEvent {
        pub id: String,
        pub contact_id: String,
        pub title: String,
        pub description: Option<String>,
        pub event_at: DateTime<Utc>,
        pub created_at: DateTime<Utc>,
        pub updated_at: DateTime<Utc>,
    }

    #[derive(Debug, Serialize, Deserialize, sqlx::FromRow, Clone)]
    pub struct EmailTemplate {
        pub id: String,
        pub name: String,
        pub subject: Option<String>,
        pub body: Option<String>,
        pub created_at: DateTime<Utc>,
        pub updated_at: DateTime<Utc>,
    }
}
