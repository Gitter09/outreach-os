use crate::db::models::EmailAccount;
use crate::db::Db;
use crate::gmail::GmailClient;
use crate::outlook::OutlookClient;
use anyhow::{anyhow, Result};
use chrono::Utc;
use sqlx::Row;

/// A resolved file to attach to an outgoing email.
/// Constructed from a raw path; Rust reads bytes at send time.
#[derive(Debug, Clone)]
pub struct OutgoingAttachment {
    pub path: String,
    pub filename: String,
    pub mime_type: String,
}

fn mime_from_extension(filename: &str) -> &'static str {
    let ext = std::path::Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    match ext.as_str() {
        "pdf" => "application/pdf",
        "doc" => "application/msword",
        "docx" => "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" => "application/vnd.ms-excel",
        "xlsx" => "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "ppt" => "application/vnd.ms-powerpoint",
        "pptx" => "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "txt" => "text/plain",
        "csv" => "text/csv",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "zip" => "application/zip",
        _ => "application/octet-stream",
    }
}

pub fn resolve_attachment(path: &str) -> Result<OutgoingAttachment> {
    let p = std::path::Path::new(path);
    if !p.exists() {
        return Err(anyhow!("Attachment not found: {}", path));
    }
    let filename = p
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| anyhow!("Cannot determine filename for: {}", path))?
        .to_string();
    let mime_type = mime_from_extension(&filename).to_string();
    Ok(OutgoingAttachment {
        path: path.to_string(),
        filename,
        mime_type,
    })
}

pub struct EmailService {
    db: Db,
    gmail: GmailClient,
    outlook: OutlookClient,
}

/// Result of syncing a single account
#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct SyncResult {
    pub account_id: String,
    pub account_email: String,
    pub provider: String,
    pub synced_count: usize,
    pub skipped_count: usize,
    pub token_expired: bool,
    pub error: Option<String>,
}

impl EmailService {
    pub fn new(db: Db) -> Self {
        Self {
            db,
            gmail: GmailClient::new(),
            outlook: OutlookClient::new(),
        }
    }

    /// Register or update an email account with new tokens
    pub async fn register_account(
        &self,
        provider: &str,
        email: &str,
        access_token: &str,
        refresh_token: Option<&str>,
        expires_in: Option<i64>,
    ) -> Result<()> {
        let pool = self.db.pool();
        let expires_at = expires_in.map(|s| Utc::now().timestamp() + s);

        // Encrypt tokens before storage
        let encrypted_access = crate::crypto::encrypt(access_token)?;
        let encrypted_refresh = match refresh_token {
            Some(rt) => Some(crate::crypto::encrypt(rt)?),
            None => None,
        };

        // Check if account exists
        let existing =
            sqlx::query("SELECT id FROM email_accounts WHERE email = ? AND provider = ?")
                .bind(email)
                .bind(provider)
                .fetch_optional(pool)
                .await?;

        if let Some(row) = existing {
            let id: String = row.get("id");
            // Update
            let mut query = "UPDATE email_accounts SET access_token = ?, expires_at = ?, updated_at = CURRENT_TIMESTAMP".to_string();
            if encrypted_refresh.is_some() {
                query.push_str(", refresh_token = ?");
            }
            query.push_str(" WHERE id = ?");

            let mut q = sqlx::query(&query).bind(&encrypted_access).bind(expires_at);

            if let Some(ref rt) = encrypted_refresh {
                q = q.bind(rt);
            }

            q.bind(id).execute(pool).await?;
        } else {
            // Insert
            let id = uuid::Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO email_accounts (id, provider, email, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?, ?, ?)"
            )
            .bind(id)
            .bind(provider)
            .bind(email)
            .bind(&encrypted_access)
            .bind(&encrypted_refresh)
            .bind(expires_at)
            .execute(pool)
            .await?;
        }

        Ok(())
    }

    /// Retrieve an account and refresh token if needed
    pub async fn get_account(&self, account_id: &str) -> Result<EmailAccount> {
        let pool = self.db.pool();
        let mut account =
            sqlx::query_as::<_, EmailAccount>("SELECT id, provider, email, access_token, refresh_token, expires_at, last_synced_at, created_at, updated_at FROM email_accounts WHERE id = ?")
                .bind(account_id)
                .fetch_optional(pool)
                .await?
                .ok_or_else(|| anyhow!("Account not found"))?;

        // Decrypt tokens (backward-compatible with legacy plaintext)
        account.access_token = crate::crypto::decrypt_or_passthrough(&account.access_token);
        if let Some(ref rt) = account.refresh_token {
            account.refresh_token = Some(crate::crypto::decrypt_or_passthrough(rt));
        }

        // Check expiration (buffer 60s)
        if let Some(expires_at) = account.expires_at {
            if Utc::now().timestamp() >= expires_at - 60 {
                // Refresh needed
                if let Some(refresh_token) = &account.refresh_token {
                    let new_tokens = match account.provider.as_str() {
                        "gmail" => {
                            let resp = self.gmail.refresh_token(refresh_token).await?;
                            (resp.access_token, resp.refresh_token, resp.expires_in)
                        }
                        "outlook" => {
                            let resp = self.outlook.refresh_token(refresh_token).await?;
                            (resp.access_token, resp.refresh_token, resp.expires_in)
                        }
                        _ => return Err(anyhow!("Unknown provider")),
                    };

                    let new_expires_at = new_tokens.2.map(|s| Utc::now().timestamp() + s);

                    // Encrypt new tokens before storing
                    let encrypted_access = crate::crypto::encrypt(&new_tokens.0)?;
                    let encrypted_refresh = match &new_tokens.1 {
                        Some(rt) => Some(crate::crypto::encrypt(rt)?),
                        None => None,
                    };

                    // Update DB with encrypted tokens
                    sqlx::query(
                        "UPDATE email_accounts SET access_token = ?, refresh_token = COALESCE(?, refresh_token), expires_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
                    )
                    .bind(&encrypted_access)
                    .bind(&encrypted_refresh)
                    .bind(new_expires_at)
                    .bind(&account.id)
                    .execute(pool)
                    .await?;

                    // Update in-memory struct with plaintext (for immediate use)
                    account.access_token = new_tokens.0;
                    if let Some(rt) = new_tokens.1 {
                        account.refresh_token = Some(rt);
                    }
                    account.expires_at = new_expires_at;
                }
            }
        }

        Ok(account)
    }

    pub async fn list_accounts(&self) -> Result<Vec<EmailAccount>> {
        let accounts = sqlx::query_as::<_, EmailAccount>(
            "SELECT id, provider, email, access_token, refresh_token, expires_at, last_synced_at, created_at, updated_at FROM email_accounts ORDER BY created_at DESC",
        )
        .fetch_all(self.db.pool())
        .await?;
        Ok(accounts)
    }

    pub async fn delete_account(&self, account_id: &str) -> Result<()> {
        sqlx::query("DELETE FROM email_accounts WHERE id = ?")
            .bind(account_id)
            .execute(self.db.pool())
            .await?;
        Ok(())
    }

    /// Get emails for a contact (properly resolved by contact email)
    pub async fn get_emails_for_contact(
        &self,
        contact_id: &str,
    ) -> Result<Vec<crate::db::models::EmailMessage>> {
        // First resolve the contact's email address
        let contact_email: Option<(String,)> = sqlx::query_as(
            "SELECT email FROM contacts WHERE id = ? AND email IS NOT NULL AND email != ''",
        )
        .bind(contact_id)
        .fetch_optional(self.db.pool())
        .await?;

        let email = match contact_email {
            Some((e,)) => e,
            None => return Ok(vec![]),
        };

        let emails = sqlx::query_as::<_, crate::db::models::EmailMessage>(
            "SELECT id, thread_id, from_email, to_email, subject, body, html_body, sent_at, status, provider_message_id, manually_assigned, created_at FROM email_messages WHERE from_email = ? OR to_email = ? ORDER BY sent_at DESC"
        )
        .bind(&email)
        .bind(&email)
        .fetch_all(self.db.pool())
        .await?;

        Ok(emails)
    }

    /// Write raw attachment bytes to `~/.jobdex/attachments/<message_id>/` and insert metadata.
    async fn save_attachments(
        &self,
        message_id: &str,
        attachments: Vec<crate::gmail::RawAttachment>,
    ) -> anyhow::Result<()> {
        let base_dir = dirs::home_dir()
            .unwrap_or_else(|| std::path::PathBuf::from("."))
            .join(".jobdex")
            .join("attachments")
            .join(message_id);
        tokio::fs::create_dir_all(&base_dir).await?;

        for attachment in attachments {
            // Sanitize filename to avoid path traversal
            let safe_name = attachment
                .filename
                .replace(['/', '\\', ':', '*', '?', '"', '<', '>', '|'], "_");
            let file_path = base_dir.join(&safe_name);
            tokio::fs::write(&file_path, &attachment.data).await?;

            let attachment_id = uuid::Uuid::new_v4().to_string();
            let path_str = file_path.to_string_lossy().to_string();
            sqlx::query(
                "INSERT OR IGNORE INTO email_attachments (id, message_id, filename, content_type, file_size, file_path) \
                 VALUES (?, ?, ?, ?, ?, ?)"
            )
            .bind(&attachment_id)
            .bind(message_id)
            .bind(&safe_name)
            .bind(&attachment.content_type)
            .bind(attachment.data.len() as i64)
            .bind(&path_str)
            .execute(self.db.pool())
            .await?;
        }
        Ok(())
    }

    /// Retrieve attachment metadata for a given email message.
    pub async fn get_attachments_for_message(
        &self,
        message_id: &str,
    ) -> anyhow::Result<Vec<crate::db::models::EmailAttachment>> {
        let attachments = sqlx::query_as::<_, crate::db::models::EmailAttachment>(
            "SELECT id, message_id, filename, content_type, file_size, file_path, created_at FROM email_attachments WHERE message_id = ? ORDER BY created_at ASC"
        )
        .bind(message_id)
        .fetch_all(self.db.pool())
        .await?;
        Ok(attachments)
    }

    /// Get all synced emails across all contacts, ordered by most recent first.
    pub async fn get_all_emails(
        &self,
        status_filter: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<crate::db::models::EmailMessage>> {
        let emails = match status_filter {
            Some(status) => sqlx::query_as::<_, crate::db::models::EmailMessage>(
                "SELECT id, thread_id, from_email, to_email, subject, body, html_body, sent_at, status, provider_message_id, manually_assigned, created_at FROM email_messages WHERE status = ? ORDER BY sent_at DESC LIMIT ? OFFSET ?"
            )
            .bind(status)
            .bind(limit)
            .bind(offset)
            .fetch_all(self.db.pool())
            .await?,
            None => sqlx::query_as::<_, crate::db::models::EmailMessage>(
                "SELECT id, thread_id, from_email, to_email, subject, body, html_body, sent_at, status, provider_message_id, manually_assigned, created_at FROM email_messages ORDER BY sent_at DESC LIMIT ? OFFSET ?"
            )
            .bind(limit)
            .bind(offset)
            .fetch_all(self.db.pool())
            .await?,
        };
        Ok(emails)
    }

    /// Send an email via the provider API.
    /// NOTE: No local logging — the sync will pick up sent emails from the provider's Sent folder.
    pub async fn send_email(
        &self,
        account_id: &str,
        to: &str,
        subject: &str,
        body: &str,
        attachment_paths: Vec<String>,
    ) -> Result<String> {
        let attachments: Vec<OutgoingAttachment> = attachment_paths
            .iter()
            .map(|p| resolve_attachment(p))
            .collect::<Result<_>>()?;

        let account = self.get_account(account_id).await?;

        let message_id = match account.provider.as_str() {
            "gmail" => {
                self.gmail
                    .send_email(&account.access_token, to, subject, body, &attachments)
                    .await?
            }
            "outlook" => {
                self.outlook
                    .send_email(&account.access_token, to, subject, body, &attachments)
                    .await?
            }
            _ => return Err(anyhow!("Unknown provider")),
        };

        Ok(message_id)
    }

    /// Sync emails for a single account from the provider API.
    /// Only syncs emails where sender or recipient matches a CRM contact.
    pub async fn sync_account(&self, account_id: &str) -> Result<SyncResult> {
        // 1. Get account (auto-refreshes token)
        let account = match self.get_account(account_id).await {
            Ok(a) => a,
            Err(e) => {
                let token_expired = e.to_string().contains("TOKEN_EXPIRED")
                    || e.to_string().contains("Token refresh failed");
                // get_account failed so we have no account struct; fetch email directly
                let account_email = sqlx::query_scalar::<_, String>(
                    "SELECT email FROM email_accounts WHERE id = ?",
                )
                .bind(account_id)
                .fetch_optional(self.db.pool())
                .await
                .ok()
                .flatten()
                .unwrap_or_default();
                return Ok(SyncResult {
                    account_id: account_id.to_string(),
                    account_email,
                    provider: String::new(),
                    synced_count: 0,
                    skipped_count: 0,
                    token_expired,
                    error: Some(e.to_string()),
                });
            }
        };

        // 2. Build set of all CRM contact emails for fast lookup
        let contact_rows: Vec<(String, String)> = sqlx::query_as(
            "SELECT id, email FROM contacts WHERE email IS NOT NULL AND email != ''",
        )
        .fetch_all(self.db.pool())
        .await?;

        let contact_email_to_id: std::collections::HashMap<String, String> = contact_rows
            .into_iter()
            .map(|(id, email)| (email.to_lowercase(), id))
            .collect();

        // 3. Get last_synced_at for incremental sync
        let last_synced: Option<(Option<i64>,)> = sqlx::query_as(
            "SELECT CAST(strftime('%s', last_synced_at) AS INTEGER) FROM email_accounts WHERE id = ?"
        )
        .bind(&account.id)
        .fetch_optional(self.db.pool())
        .await?;

        let after_ts = last_synced.and_then(|(ts,)| ts);

        // 4. Fetch messages from provider (filtered by CRM contacts at API level)
        let mut synced_count = 0usize;
        let mut skipped_count = 0usize;

        let contact_emails: Vec<String> = contact_email_to_id.keys().cloned().collect();

        let messages_result = match account.provider.as_str() {
            "gmail" => {
                let stubs = match self
                    .gmail
                    .list_messages(&account.access_token, &contact_emails, after_ts, 200)
                    .await
                {
                    Ok(s) => s,
                    Err(e) if e.to_string().contains("TOKEN_EXPIRED") => {
                        return Ok(SyncResult {
                            account_id: account.id.clone(),
                            account_email: account.email.clone(),
                            provider: account.provider.clone(),
                            synced_count: 0,
                            skipped_count: 0,
                            token_expired: true,
                            error: Some("Token expired".to_string()),
                        });
                    }
                    Err(e) => return Err(e),
                };

                let mut messages = Vec::new();
                for stub in stubs {
                    match self
                        .gmail
                        .get_message(&account.access_token, &stub.id)
                        .await
                    {
                        Ok(msg) => messages.push((
                            msg.id,
                            msg.from_email,
                            msg.to_email,
                            msg.subject,
                            msg.body,
                            msg.html_body,
                            msg.sent_at,
                            msg.attachments,
                        )),
                        Err(e) => eprintln!("Failed to fetch Gmail message {}: {}", stub.id, e),
                    }
                }
                messages
            }
            "outlook" => {
                let msgs = match self
                    .outlook
                    .list_messages(&account.access_token, &contact_emails, after_ts, 200)
                    .await
                {
                    Ok(m) => m,
                    Err(e) if e.to_string().contains("TOKEN_EXPIRED") => {
                        return Ok(SyncResult {
                            account_id: account.id.clone(),
                            account_email: account.email.clone(),
                            provider: account.provider.clone(),
                            synced_count: 0,
                            skipped_count: 0,
                            token_expired: true,
                            error: Some("Token expired".to_string()),
                        });
                    }
                    Err(e) => return Err(e),
                };
                msgs.into_iter()
                    .map(|m| {
                        (
                            m.id,
                            m.from_email,
                            m.to_email,
                            m.subject,
                            m.body,
                            m.html_body,
                            m.sent_at,
                            Vec::new(), // Outlook attachment support: future work
                        )
                    })
                    .collect()
            }
            _ => return Err(anyhow!("Unknown provider: {}", account.provider)),
        };

        // 5. Process each message

        for (
            provider_msg_id,
            from_email,
            to_email,
            subject,
            body,
            html_body,
            sent_at,
            raw_attachments,
        ) in messages_result
        {
            let from_lower = from_email.to_lowercase();
            let to_lower = to_email.to_lowercase();
            let account_email_lower = account.email.to_lowercase();

            // Determine which side is the contact
            let (contact_email, status) = if from_lower == account_email_lower {
                // We sent this email
                (to_lower.clone(), "sent")
            } else {
                // We received this email
                (from_lower.clone(), "received")
            };

            // Skip if contact not in CRM
            let contact_id = match contact_email_to_id.get(&contact_email) {
                Some(id) => id.clone(),
                None => {
                    skipped_count += 1;
                    continue;
                }
            };

            // 6. Find or create thread keyed by (contact_email, account_email)
            let thread_result: Option<(String,)> = sqlx::query_as(
                "SELECT id FROM email_threads WHERE contact_id = ? AND account_id = ?",
            )
            .bind(&contact_id)
            .bind(&account.id)
            .fetch_optional(self.db.pool())
            .await?;

            let thread_id = if let Some((tid,)) = thread_result {
                // Update last_message_at
                sqlx::query("UPDATE email_threads SET last_message_at = ? WHERE id = ?")
                    .bind(sent_at)
                    .bind(&tid)
                    .execute(self.db.pool())
                    .await?;
                tid
            } else {
                let tid = uuid::Uuid::new_v4().to_string();
                sqlx::query(
                    "INSERT INTO email_threads (id, contact_id, account_id, subject, last_message_at) VALUES (?, ?, ?, ?, ?)"
                )
                .bind(&tid)
                .bind(&contact_id)
                .bind(&account.id)
                .bind(&subject)
                .bind(sent_at)
                .execute(self.db.pool())
                .await?;
                tid
            };

            // 7. Upsert message:
            //    - INSERT OR IGNORE to avoid duplicates
            //    - Then UPDATE body/subject if the existing row has an empty body
            //      (handles the case where a previous sync stored an empty body)
            let msg_id = uuid::Uuid::new_v4().to_string();
            let insert_result = sqlx::query(
                "INSERT OR IGNORE INTO email_messages \
                 (id, thread_id, from_email, to_email, subject, body, html_body, sent_at, status, provider_message_id, created_at) \
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)"
            )
            .bind(&msg_id)
            .bind(&thread_id)
            .bind(&from_email)
            .bind(&to_email)
            .bind(&subject)
            .bind(&body)
            .bind(&html_body)
            .bind(sent_at)
            .bind(status)
            .bind(&provider_msg_id)
            .execute(self.db.pool())
            .await?;

            if insert_result.rows_affected() > 0 {
                synced_count += 1;
                // Save any attachments to disk and record metadata in DB
                if !raw_attachments.is_empty() {
                    if let Err(e) = self.save_attachments(&msg_id, raw_attachments).await {
                        eprintln!("[sync] Failed to save attachments for {}: {}", msg_id, e);
                    }
                }
            } else {
                // Row already existed — backfill body if it was previously empty
                if !body.is_empty() {
                    let update_result = sqlx::query(
                        "UPDATE email_messages SET body = ?, subject = ?, html_body = COALESCE(html_body, ?) \
                         WHERE provider_message_id = ? AND (body IS NULL OR body = '')",
                    )
                    .bind(&body)
                    .bind(&subject)
                    .bind(&html_body)
                    .bind(&provider_msg_id)
                    .execute(self.db.pool())
                    .await?;

                    if update_result.rows_affected() > 0 {
                        eprintln!(
                            "[sync] Backfilled empty body for provider_msg_id={}",
                            provider_msg_id
                        );
                        synced_count += 1; // Count as synced since we updated it
                    } else {
                        skipped_count += 1;
                    }
                } else {
                    skipped_count += 1;
                }
            }
        }

        // 8. Update last_synced_at
        sqlx::query("UPDATE email_accounts SET last_synced_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(&account.id)
            .execute(self.db.pool())
            .await?;

        Ok(SyncResult {
            account_id: account.id,
            account_email: account.email,
            provider: account.provider,
            synced_count,
            skipped_count,
            token_expired: false,
            error: None,
        })
    }

    /// Sync all connected accounts. Returns results for each account.
    pub async fn sync_all_accounts(&self) -> Result<Vec<SyncResult>> {
        let accounts = self.list_accounts().await?;
        let mut results = Vec::new();

        for account in accounts {
            let result = self.sync_account(&account.id).await?;
            results.push(result);
        }

        Ok(results)
    }

    pub async fn schedule_email(
        &self,
        account_id: &str,
        contact_id: &str,
        subject: &str,
        body: &str,
        scheduled_at: i64,
        attachment_paths: Vec<String>,
    ) -> Result<String> {
        for path in &attachment_paths {
            if !std::path::Path::new(path).exists() {
                return Err(anyhow!("Attachment not found: {}", path));
            }
        }

        let id = uuid::Uuid::new_v4().to_string();
        let scheduled_time = chrono::DateTime::from_timestamp(scheduled_at, 0)
            .ok_or_else(|| anyhow!("Invalid timestamp"))?;
        let attachments_json = serde_json::to_string(&attachment_paths)?;

        sqlx::query(
            "INSERT INTO scheduled_emails (id, contact_id, account_id, subject, body, scheduled_at, status, attachment_paths, created_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, CURRENT_TIMESTAMP)"
        )
        .bind(&id)
        .bind(contact_id)
        .bind(account_id)
        .bind(subject)
        .bind(body)
        .bind(scheduled_time)
        .bind(&attachments_json)
        .execute(self.db.pool())
        .await?;

        Ok(id)
    }
}
