use outreach_core::Db;
use tauri::Manager;

mod error;
use error::AppError;
// use std::fs; removed

// Extracts first and last name from page title or LinkedIn URL slug
// extract_names_from_title_or_url function removed as it's never used

fn extract_linkedin_slug(url: &str) -> Option<&str> {
    // Match /in/username or /pub/username patterns
    url.split("/in/")
        .nth(1)
        .or_else(|| url.split("/pub/").nth(1))
        .map(|s| s.split('/').next().unwrap_or(s))
        .map(|s| s.split('?').next().unwrap_or(s))
}

// capitalise function removed as it's never used

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[derive(serde::Serialize)]
struct ContactWithTags {
    #[serde(flatten)]
    contact: outreach_core::models::Contact,
    tags: Vec<outreach_core::models::Tag>,
}

#[tauri::command]
async fn get_contacts(db: tauri::State<'_, Db>) -> Result<Vec<ContactWithTags>, AppError> {
    let pool = db.pool();

    // 1. Fetch Contacts
    let contacts = sqlx::query_as::<sqlx::Sqlite, outreach_core::models::Contact>(
        r#"
        SELECT 
            c.*, 
            s.label as status_label, 
            s.color as status_color 
        FROM contacts c 
        LEFT JOIN statuses s ON c.status_id = s.id
        ORDER BY c.updated_at DESC
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    // 2. Fetch All Tag Assignments
    // We fetch (contact_id, tag_id, tag_name, tag_color)
    #[derive(sqlx::FromRow)]
    struct TagAssignment {
        contact_id: String,
        id: String,
        name: String,
        color: String,
        created_at: chrono::DateTime<chrono::Utc>,
    }

    let assignments = sqlx::query_as::<sqlx::Sqlite, TagAssignment>(
        r#"
        SELECT ct.contact_id, t.* 
        FROM tags t 
        JOIN contact_tags ct ON t.id = ct.tag_id
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    // 3. Group Tags by Contact ID
    use std::collections::HashMap;
    let mut tags_by_contact: HashMap<String, Vec<outreach_core::models::Tag>> = HashMap::new();

    for a in assignments {
        tags_by_contact
            .entry(a.contact_id)
            .or_default()
            .push(outreach_core::models::Tag {
                id: a.id,
                name: a.name,
                color: a.color,
                created_at: a.created_at,
            });
    }

    // 4. Merge
    let result: Vec<ContactWithTags> = contacts
        .into_iter()
        .map(|c| {
            let tags = tags_by_contact.remove(&c.id).unwrap_or_default();
            ContactWithTags { contact: c, tags }
        })
        .collect();

    Ok(result)
}

#[tauri::command]
async fn get_statuses(
    db: tauri::State<'_, Db>,
) -> Result<Vec<outreach_core::models::Status>, AppError> {
    let pool = db.pool();
    let statuses = sqlx::query_as::<sqlx::Sqlite, outreach_core::models::Status>(
        "SELECT * FROM statuses ORDER BY position ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(statuses)
}

#[tauri::command]
async fn create_status(
    db: tauri::State<'_, Db>,
    label: String,
    color: String,
) -> Result<String, AppError> {
    let pool = db.pool();
    let id = uuid::Uuid::new_v4().to_string();
    // automated position at end
    sqlx::query("INSERT INTO statuses (id, label, color, position) VALUES (?, ?, ?, (SELECT COUNT(*) FROM statuses))")
        .bind(&id)
        .bind(label)
        .bind(color)
        .execute(pool)
        .await?;
    Ok(id)
}

#[tauri::command]
async fn update_status(
    db: tauri::State<'_, Db>,
    id: String,
    label: String,
    color: String,
) -> Result<(), AppError> {
    let pool = db.pool();
    sqlx::query(
        "UPDATE statuses SET label = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(label)
    .bind(color)
    .bind(id)
    .execute(pool)
    .await?;
    Ok(())
}

#[tauri::command]
async fn delete_status(db: tauri::State<'_, Db>, id: String) -> Result<(), AppError> {
    let pool = db.pool();
    // fallback contacts to default? or set null?
    // SQLite FK might restrict. For now, let's just delete and let contacts contain orphaned status_id (bad practice) or set null.
    // Better: set status_id to null for contacts using this status.
    let mut tx = pool.begin().await?;

    sqlx::query("UPDATE contacts SET status_id = NULL WHERE status_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM statuses WHERE id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

#[derive(serde::Deserialize)]
pub struct AddContactArgs {
    pub first_name: String,
    pub last_name: String,
    pub email: Option<String>,
    pub linkedin_url: Option<String>,
    pub status_id: Option<String>,
    pub title: Option<String>,
    pub company: Option<String>,
    pub location: Option<String>,
    pub company_website: Option<String>,
}

#[tauri::command]
async fn add_contact(db: tauri::State<'_, Db>, args: AddContactArgs) -> Result<String, AppError> {
    let pool = db.pool();
    let id = uuid::Uuid::new_v4().to_string();

    // Normalize: treat empty string the same as None
    let provided_status_id = args.status_id.filter(|s| !s.trim().is_empty());

    // Resolve the final status_id — use provided value, or look up the
    // default status from the DB so we never hardcode a specific ID.
    let (final_status_id, final_status_label) = if let Some(sid) = provided_status_id {
        // Verify the provided status_id actually exists to give a cleaner error
        let exists: Option<(String, String)> =
            sqlx::query_as("SELECT id, label FROM statuses WHERE id = ?")
                .bind(&sid)
                .fetch_optional(pool)
                .await
                .map_err(|e: sqlx::Error| e.to_string())?;

        match exists {
            Some((id, label)) => (id, label),
            None => return Err(format!("Status '{}' does not exist.", sid).into()),
        }
    } else {
        // Fallback: query the DB for is_default = 1, or just the first status
        let default_status: Option<(String, String)> = sqlx::query_as(
            "SELECT id, label FROM statuses ORDER BY is_default DESC, position ASC LIMIT 1",
        )
        .fetch_optional(pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

        match default_status {
            Some((id, label)) => (id, label),
            None => {
                return Err(
                    "No statuses found in database. Please create a status first."
                        .to_string()
                        .into(),
                )
            }
        }
    };

    sqlx::query("INSERT INTO contacts (id, first_name, last_name, email, linkedin_url, status, status_id, title, company, location, company_website) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(args.first_name)
        .bind(args.last_name)
        .bind(args.email)
        .bind(args.linkedin_url)
        .bind(&final_status_label) // Legacy status field
        .bind(&final_status_id)
        .bind(args.title)
        .bind(args.company)
        .bind(args.location)
        .bind(args.company_website)
        .execute(pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(id)
}

#[derive(serde::Deserialize)]
pub struct UpdateContactArgs {
    pub id: String,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub email: Option<String>,
    pub linkedin_url: Option<String>,
    pub status: Option<String>, // Legacy
    pub status_id: Option<String>,
    pub last_contacted_date: Option<chrono::DateTime<chrono::Utc>>,
    pub next_contact_date: Option<chrono::DateTime<chrono::Utc>>,
    pub cadence_stage: Option<i32>,
    pub title: Option<String>,
    pub company: Option<String>,
    pub location: Option<String>,
    pub company_website: Option<String>,
    pub intelligence_summary: Option<String>,
}

#[tauri::command]
async fn update_contact(db: tauri::State<'_, Db>, args: UpdateContactArgs) -> Result<(), AppError> {
    let pool = db.pool();

    sqlx::query(
        r#"
        UPDATE contacts SET 
            first_name = COALESCE(?, first_name), 
            last_name = COALESCE(?, last_name), 
            email = COALESCE(?, email), 
            linkedin_url = COALESCE(?, linkedin_url), 
            status = COALESCE(?, status),
            status_id = COALESCE(?, status_id),
            last_contacted_date = COALESCE(?, last_contacted_date),
            next_contact_date = COALESCE(?, next_contact_date),
            cadence_stage = COALESCE(?, cadence_stage),
            title = COALESCE(?, title),
            company = COALESCE(?, company),
            location = COALESCE(?, location),
            company_website = COALESCE(?, company_website),
            intelligence_summary = COALESCE(?, intelligence_summary),
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
        "#,
    )
    .bind(args.first_name)
    .bind(args.last_name)
    .bind(args.email)
    .bind(args.linkedin_url)
    .bind(args.status)
    .bind(args.status_id)
    .bind(args.last_contacted_date)
    .bind(args.next_contact_date)
    .bind(args.cadence_stage)
    .bind(args.title)
    .bind(args.company)
    .bind(args.location)
    .bind(args.company_website)
    .bind(args.intelligence_summary)
    .bind(args.id)
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle();
            let app_dir = app_handle
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");

            // Ensure directory exists
            std::fs::create_dir_all(&app_dir).expect("failed to create app data dir");

            let db_path = app_dir.join("outreach.db");
            let db_path_str = db_path.to_str().expect("invalid path");

            let db = tauri::async_runtime::block_on(async {
                let result = Db::new(db_path_str).await.expect("failed to init core");
                result
            });

            app.manage(db);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_contacts,
            get_statuses,
            create_status,
            update_status,
            delete_status,
            add_contact,
            update_contact,
            delete_contact,
            get_email_accounts,
            gmail_connect,
            outlook_connect,
            email_send,
            delete_email_account,
            email_schedule,
            get_emails_for_contact,
            save_api_key,
            get_settings,
            save_setting,
            export_all_data,
            clear_all_data,
            import_contacts,
            analyze_import,
            get_import_headers,
            delete_contacts_bulk,
            update_contacts_status_bulk,
            get_tags,
            create_tag,
            update_tag,
            delete_tag,
            assign_tag,
            unassign_tag,
            check_email_credentials,
            save_email_credentials,
            fix_orphan_contacts,
            sync_email_accounts,
            sync_email_account,
            reset_email_sync_state,
            poll_email_tracking,
            get_email_tracking,
            set_lock_pin,
            verify_lock_pin,
            has_lock_pin,
            remove_lock_pin
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn fix_orphan_contacts(db: tauri::State<'_, Db>) -> Result<String, AppError> {
    let pool = db.pool();

    // Ensure statuses exist
    sqlx::query(
        r#"
        INSERT OR IGNORE INTO statuses (id, label, color, position, is_default) VALUES 
        ('stat-new', 'New', '#3b82f6', 0, 1),
        ('stat-contacted', 'Contacted', '#eab308', 1, 0),
        ('stat-replied', 'Replied', '#a855f7', 2, 0),
        ('stat-interested', 'Interested', '#22c55e', 3, 0),
        ('stat-not-interested', 'Not Interested', '#ef4444', 4, 0)
        "#,
    )
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    // Count before
    let before: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM contacts WHERE status_id IS NULL OR status_id NOT IN ('stat-new', 'stat-contacted', 'stat-replied', 'stat-interested', 'stat-not-interested')")
        .fetch_one(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Fix NULL status_id
    sqlx::query("UPDATE contacts SET status_id = 'stat-new' WHERE status_id IS NULL")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Fix legacy def-stat-* IDs
    sqlx::query("UPDATE contacts SET status_id = 'stat-new' WHERE status_id LIKE 'def-stat-%'")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Fix any other invalid status_id
    sqlx::query("UPDATE contacts SET status_id = 'stat-new' WHERE status_id IS NOT NULL AND status_id NOT IN ('stat-new', 'stat-contacted', 'stat-replied', 'stat-interested', 'stat-not-interested')")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Cleanup old statuses
    sqlx::query("DELETE FROM statuses WHERE id = 'stat-int-ni'")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM statuses WHERE id LIKE 'def-stat-%'")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM statuses WHERE label LIKE '%_legacy'")
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(format!("Fixed {} orphan contacts", before.0))
}

#[tauri::command]
async fn delete_contact(db: tauri::State<'_, Db>, id: String) -> Result<(), String> {
    let pool = db.pool();
    sqlx::query("DELETE FROM contacts WHERE id = ?")
        .bind(&id)
        .execute(pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(())
}

// ===== Gmail Commands =====

#[tauri::command]
async fn get_email_accounts(
    db: tauri::State<'_, Db>,
) -> Result<Vec<outreach_core::models::EmailAccount>, AppError> {
    let service = outreach_core::EmailService::new(db.inner().clone());
    service
        .list_accounts()
        .await
        .map_err(|e| AppError::from(e.to_string()))
}

#[tauri::command]
async fn gmail_connect(db: tauri::State<'_, Db>) -> Result<String, AppError> {
    use std::net::TcpListener;
    use std::thread;

    let client = outreach_core::gmail::GmailClient::new();

    // Bind to ephemeral port FIRST to prevent port hijacking
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to bind OAuth listener: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get listener port: {}", e))?
        .port();

    // Get auth URL using the actual bound port
    let (auth_url, pkce_verifier, csrf_token) =
        client.get_auth_url(port).map_err(|e| e.to_string())?;

    // Open browser
    open::that(&auth_url).map_err(|e| format!("Failed to open browser: {}", e))?;

    // Wait for callback on the already-bound listener, validating CSRF state
    let csrf_for_thread = csrf_token.clone();
    let code = thread::spawn(move || client.wait_for_callback(listener, &csrf_for_thread))
        .join()
        .map_err(|_| "OAuth callback thread panicked".to_string())?
        .map_err(|e| e.to_string())?;

    // Exchange code (must use the same port for redirect_uri)
    let client = outreach_core::gmail::GmailClient::new();
    let tokens = client
        .exchange_code(code, pkce_verifier, port)
        .await
        .map_err(|e| e.to_string())?;

    // Get Profile (Email)
    let email = client
        .get_user_profile(&tokens.access_token)
        .await
        .map_err(|e| e.to_string())?;

    // Save to DB
    let service = outreach_core::EmailService::new(db.inner().clone());
    service
        .register_account(
            "gmail",
            &email,
            &tokens.access_token,
            tokens.refresh_token.as_deref(),
            tokens.expires_in,
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(format!("Connected to Gmail: {}", email))
}

#[tauri::command]
async fn outlook_connect(db: tauri::State<'_, Db>) -> Result<String, AppError> {
    use std::net::TcpListener;
    use std::thread;

    let client = outreach_core::outlook::OutlookClient::new();

    // Bind to ephemeral port FIRST to prevent port hijacking
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Failed to bind OAuth listener: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Failed to get listener port: {}", e))?
        .port();

    let (auth_url, pkce_verifier, csrf_token) =
        client.get_auth_url(port).map_err(|e| e.to_string())?;

    open::that(&auth_url).map_err(|e| format!("Failed to open browser: {}", e))?;

    let csrf_for_thread = csrf_token.clone();
    let code = thread::spawn(move || client.wait_for_callback(listener, &csrf_for_thread))
        .join()
        .map_err(|_| "OAuth callback thread panicked".to_string())?
        .map_err(|e| e.to_string())?;

    let client = outreach_core::outlook::OutlookClient::new();
    let tokens = client
        .exchange_code(code, pkce_verifier, port)
        .await
        .map_err(|e| e.to_string())?;

    let email = client
        .get_user_profile(&tokens.access_token)
        .await
        .map_err(|e| e.to_string())?;

    let service = outreach_core::EmailService::new(db.inner().clone());
    service
        .register_account(
            "outlook",
            &email,
            &tokens.access_token,
            tokens.refresh_token.as_deref(),
            tokens.expires_in,
        )
        .await
        .map_err(|e| e.to_string())?;

    Ok(format!("Connected to Outlook: {}", email))
}

#[tauri::command]
async fn email_send(
    db: tauri::State<'_, Db>,
    account_id: String,
    to: String,
    subject: String,
    body: String,
) -> Result<String, AppError> {
    let service = outreach_core::EmailService::new(db.inner().clone());
    service
        .send_email(&account_id, &to, &subject, &body)
        .await
        .map_err(|e| e.to_string().into())
}

#[tauri::command]
async fn email_schedule(
    db: tauri::State<'_, Db>,
    account_id: String,
    contact_id: String,
    subject: String,
    body: String,
    scheduled_at: i64,
) -> Result<String, AppError> {
    let service = outreach_core::EmailService::new(db.inner().clone());
    service
        .schedule_email(&account_id, &contact_id, &subject, &body, scheduled_at)
        .await
        .map_err(|e| e.to_string().into())
}

#[tauri::command]
async fn get_emails_for_contact(
    db: tauri::State<'_, Db>,
    contact_id: String,
) -> Result<Vec<outreach_core::models::EmailMessage>, AppError> {
    let service = outreach_core::EmailService::new(db.inner().clone());
    service
        .get_emails_for_contact(&contact_id)
        .await
        .map_err(|e| e.to_string().into())
}

#[tauri::command]
async fn delete_email_account(
    db: tauri::State<'_, Db>,
    account_id: String,
) -> Result<(), AppError> {
    let service = outreach_core::EmailService::new(db.inner().clone());
    service
        .delete_account(&account_id)
        .await
        .map_err(|e| AppError::from(e.to_string()))
}

#[tauri::command]
async fn sync_email_accounts(
    db: tauri::State<'_, Db>,
) -> Result<Vec<outreach_core::SyncResult>, AppError> {
    let service = outreach_core::EmailService::new(db.inner().clone());
    service
        .sync_all_accounts()
        .await
        .map_err(|e| e.to_string().into())
}

#[tauri::command]
async fn sync_email_account(
    db: tauri::State<'_, Db>,
    account_id: String,
) -> Result<outreach_core::SyncResult, AppError> {
    let service = outreach_core::EmailService::new(db.inner().clone());
    service
        .sync_account(&account_id)
        .await
        .map_err(|e| AppError::from(e.to_string()))
}

/// Reset last_synced_at to NULL for one or all accounts,
/// forcing the next sync to re-fetch all messages from the provider.
/// This is needed to backfill messages that were previously stored with empty bodies.
#[tauri::command]
async fn reset_email_sync_state(
    db: tauri::State<'_, Db>,
    account_id: Option<String>,
) -> Result<(), AppError> {
    let pool = db.pool();
    match account_id {
        Some(id) => {
            sqlx::query("UPDATE email_accounts SET last_synced_at = NULL WHERE id = ?")
                .bind(&id)
                .execute(pool)
                .await?;
        }
        None => {
            sqlx::query("UPDATE email_accounts SET last_synced_at = NULL")
                .execute(pool)
                .await?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn poll_email_tracking(db: tauri::State<'_, Db>) -> Result<usize, AppError> {
    outreach_core::tracking::poll_tracking_events(db.inner())
        .await
        .map_err(|e| e.to_string().into())
}

#[derive(serde::Serialize)]
pub struct TrackingEventResponse {
    pub event_type: String,
    pub occurred_at: String,
    pub link_url: Option<String>,
}

#[tauri::command]
async fn get_email_tracking(
    db: tauri::State<'_, Db>,
    message_id: String,
) -> Result<Vec<TrackingEventResponse>, AppError> {
    let rows: Vec<(String, chrono::DateTime<chrono::Utc>, Option<String>)> = sqlx::query_as(
        "SELECT event_type, occurred_at, link_url FROM email_tracking WHERE message_id = ? ORDER BY occurred_at DESC"
    )
    .bind(&message_id)
    .fetch_all(db.pool())
    .await
    .map_err(|e| e.to_string())?;

    Ok(rows
        .into_iter()
        .map(
            |(event_type, occurred_at, link_url)| TrackingEventResponse {
                event_type,
                occurred_at: occurred_at.to_rfc3339(),
                link_url,
            },
        )
        .collect())
}

#[tauri::command]
async fn save_api_key(
    db: tauri::State<'_, Db>,
    service: String,
    key: String,
) -> Result<(), AppError> {
    println!("--- [DB Debug] Saving key for service: {} ---", service);
    let manager = outreach_core::settings::SettingsManager::new(db.pool().clone());
    manager
        .set(&service, &key)
        .await
        .map_err(|e| e.to_string())?;
    println!("--- [DB Debug] Key saved successfully ---");
    Ok(())
}

// ===== Settings Commands =====

#[tauri::command]
async fn get_settings(
    db: tauri::State<'_, Db>,
) -> Result<std::collections::HashMap<String, String>, AppError> {
    let manager = outreach_core::settings::SettingsManager::new(db.pool().clone());
    manager.get_all().await.map_err(|e| e.to_string().into())
}

#[tauri::command]
async fn clear_all_data(db: tauri::State<'_, Db>) -> Result<(), AppError> {
    let pool = db.pool();
    let mut tx = pool.begin().await?;

    sqlx::query("DELETE FROM contacts")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM statuses")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM tags").execute(&mut *tx).await?;
    sqlx::query("DELETE FROM contact_tags")
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

#[tauri::command]
async fn export_all_data(db: tauri::State<'_, Db>) -> Result<String, AppError> {
    let pool = db.pool();

    let contacts =
        sqlx::query_as::<sqlx::Sqlite, outreach_core::models::Contact>("SELECT * FROM contacts")
            .fetch_all(pool)
            .await?;

    let statuses =
        sqlx::query_as::<sqlx::Sqlite, outreach_core::models::Status>("SELECT * FROM statuses")
            .fetch_all(pool)
            .await?;

    let settings_map = outreach_core::settings::SettingsManager::new(pool.clone())
        .get_all()
        .await?;

    let export = serde_json::json!({
        "version": "1.0",
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "contacts": contacts,
        "statuses": statuses,
        "settings": settings_map
    });

    Ok(serde_json::to_string_pretty(&export)?)
}

#[tauri::command]
async fn save_setting(
    db: tauri::State<'_, Db>,
    key: String,
    value: String,
) -> Result<(), AppError> {
    // Intercept sensitive keys and store them in OS keychain
    if key == "tracking_secret" {
        outreach_core::crypto::store_secret("tracking_secret", &value)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        return Ok(());
    }

    let manager = outreach_core::settings::SettingsManager::new(db.pool().clone());
    manager
        .set(&key, &value)
        .await
        .map_err(|e| e.to_string().into())
}

// ===== Import Commands =====

#[tauri::command]
fn get_import_headers(file_path: String) -> Result<outreach_core::import::ImportPreview, AppError> {
    // HIGH-4: Validate file path to prevent path traversal
    if file_path.contains("..") {
        return Err(AppError::Validation(
            "Invalid file path: path traversal not allowed".into(),
        ));
    }
    let path = std::path::Path::new(&file_path);
    match path.extension().and_then(|ext| ext.to_str()) {
        Some("csv") | Some("xlsx") | Some("xls") => {}
        _ => {
            return Err(AppError::Validation(
                "Only .csv and .xlsx files are supported".into(),
            ))
        }
    }
    outreach_core::import::preview_file(&file_path).map_err(|e| e.to_string().into())
}

#[derive(serde::Serialize)]
struct ImportAnalysis {
    total_detected: usize,
    new_count: usize,
    duplicate_count: usize,
}

#[derive(sqlx::FromRow)]
struct ContactIdentity {
    id: String,
    email: Option<String>,
    linkedin_url: Option<String>,
    first_name: String,
    last_name: String,
    company: Option<String>,
}

#[tauri::command]
async fn analyze_import(
    db: tauri::State<'_, Db>,
    file_path: String,
    mapping: outreach_core::import::ColumnMapping,
) -> Result<ImportAnalysis, AppError> {
    let contacts = outreach_core::import::parse_file_with_mapping(&file_path, &mapping)?;

    // Fetch existing identifiers for comparison
    let pool = db.pool();
    let existing = sqlx::query_as::<sqlx::Sqlite, ContactIdentity>(
        "SELECT id, email, linkedin_url, first_name, last_name, company FROM contacts",
    )
    .fetch_all(pool)
    .await?;

    let mut new_count = 0;
    let mut duplicate_count = 0;

    for candidate in &contacts {
        let is_duplicate = existing.iter().any(|e| {
            // 1. Email Match (Exact)
            if let (Some(e1), Some(e2)) = (&e.email, &candidate.email) {
                let e1_str: &str = e1;
                if !e1_str.is_empty() && e1_str.eq_ignore_ascii_case(e2) {
                    return true;
                }
            }

            // 2. LinkedIn Match (Slug or Exact)
            if let (Some(l1), Some(l2)) = (&e.linkedin_url, &candidate.linkedin_url) {
                let l1_str: &str = l1;
                if !l1_str.is_empty()
                    && (l1 == l2 || extract_linkedin_slug(l1) == extract_linkedin_slug(l2))
                {
                    return true;
                }
            }

            // 3. Name + Company Match (Fuzzy-ish fallback)
            if e.first_name.eq_ignore_ascii_case(&candidate.first_name)
                && e.last_name.eq_ignore_ascii_case(&candidate.last_name)
            {
                if let (Some(c1), Some(c2)) = (&e.company, &candidate.company) {
                    let c1_str: &str = c1;
                    if !c1_str.is_empty() && c1_str.eq_ignore_ascii_case(c2) {
                        return true;
                    }
                }
            }

            false
        });

        if is_duplicate {
            duplicate_count += 1;
        } else {
            new_count += 1;
        }
    }

    Ok(ImportAnalysis {
        total_detected: contacts.len(),
        new_count,
        duplicate_count,
    })
}

#[tauri::command]
async fn import_contacts(
    db: tauri::State<'_, Db>,
    file_path: String,
    mapping: outreach_core::import::ColumnMapping,
    mode: String, // "skip", "merge", "none"
) -> Result<usize, AppError> {
    let contacts = outreach_core::import::parse_file_with_mapping(&file_path, &mapping)?;

    let pool = db.pool();

    // Fetch existing for deduplication if mode is not "none"
    let existing = if mode != "none" {
        sqlx::query_as::<sqlx::Sqlite, ContactIdentity>(
            "SELECT id, email, linkedin_url, first_name, last_name, company FROM contacts",
        )
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?
    } else {
        vec![]
    };

    let mut count = 0;

    for contact in contacts {
        let mut duplicate_id: Option<String> = None;

        if mode != "none" {
            // Find duplicate ID
            duplicate_id = existing
                .iter()
                .find(|e| {
                    // Same logic as analyze
                    // 1. Email
                    if let (Some(e1), Some(e2)) = (&e.email, &contact.email) {
                        let e1_str: &str = e1;
                        if !e1_str.is_empty() && e1_str.eq_ignore_ascii_case(e2) {
                            return true;
                        }
                    }
                    // 2. LinkedIn
                    if let (Some(l1), Some(l2)) = (&e.linkedin_url, &contact.linkedin_url) {
                        let l1_str: &str = l1;
                        if !l1_str.is_empty()
                            && (l1 == l2 || extract_linkedin_slug(l1) == extract_linkedin_slug(l2))
                        {
                            return true;
                        }
                    }
                    // 3. Name + Company
                    if e.first_name.eq_ignore_ascii_case(&contact.first_name)
                        && e.last_name.eq_ignore_ascii_case(&contact.last_name)
                    {
                        if let (Some(c1), Some(c2)) = (&e.company, &contact.company) {
                            let c1_str: &str = c1;
                            if !c1_str.is_empty() && c1_str.eq_ignore_ascii_case(c2) {
                                return true;
                            }
                        }
                    }
                    false
                })
                .map(|e| e.id.clone());
        }

        if let Some(id) = duplicate_id {
            if mode == "merge" {
                // Merge Logic: Update fields only if they are missing in DB
                // This is a comprehensive update query using COALESCE logic
                // Since SQLite doesn't support complex updates easily in one go without loading,
                // and we already loaded basic info, doing a specific update is safer.
                // However, for simplicity and performance, we can just execute an update blindly for fields that are provided.
                // A better approach for "Update" is usually "Overwrite" or "Fill Missing". The user asked for "Update".
                // We'll implementing "Fill Missing" as it's safer.

                // We need to know which fields are currently NULL in DB to fill them.
                // The `existing` vec only has a few fields. Let's run a smart update.

                let _ = sqlx::query(
                    r#"
                    UPDATE contacts SET 
                        email = COALESCE(email, NULLIF(?, '')),
                        linkedin_url = COALESCE(linkedin_url, NULLIF(?, '')),
                        company = COALESCE(company, NULLIF(?, '')),
                        title = COALESCE(title, NULLIF(?, ''))
                    WHERE id = ?
                    "#,
                )
                .bind(&contact.email)
                .bind(&contact.linkedin_url)
                .bind(&contact.company)
                .bind(&contact.title)
                .bind(&id)
                .execute(pool)
                .await;

                // Count merge as "processed"
                count += 1;
            }
            // If mode == "skip", do nothing
        } else {
            // Insert New
            let id = uuid::Uuid::new_v4().to_string();
            let result = sqlx::query(
                "INSERT INTO contacts (id, first_name, last_name, email, linkedin_url, company, title, status, status_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )
                .bind(&id)
                .bind(&contact.first_name)
                .bind(&contact.last_name)
                .bind(&contact.email)
                .bind(&contact.linkedin_url)
                .bind(&contact.company)
                .bind(&contact.title)
                .bind("New")
                .bind("stat-new")
                .execute(pool)
                .await;

            if result.is_ok() {
                count += 1;
            }
        }
    }

    Ok(count)
}

#[tauri::command]
async fn delete_contacts_bulk(db: tauri::State<'_, Db>, ids: Vec<String>) -> Result<u64, String> {
    let pool = db.pool();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let mut deleted_count = 0;

    for id in ids {
        let result = sqlx::query("DELETE FROM contacts WHERE id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        deleted_count += result.rows_affected();
    }

    tx.commit().await.map_err(|e| e.to_string())?;

    Ok(deleted_count)
}

#[tauri::command]
async fn update_contacts_status_bulk(
    db: tauri::State<'_, Db>,
    ids: Vec<String>,
    status_id: String,
) -> Result<u64, AppError> {
    let pool = db.pool();
    let mut tx = pool.begin().await?;

    let mut affected_count = 0;
    // We can assume status_id is valid for now, or fetch label if we wanted to sync legacy column
    // For now we just update status_id.

    for id in ids {
        let result = sqlx::query("UPDATE contacts SET status_id = ? WHERE id = ?")
            .bind(&status_id)
            .bind(id)
            .execute(&mut *tx)
            .await?;
        affected_count += result.rows_affected();
    }

    tx.commit().await?;
    Ok(affected_count)
}

// ===== Tag Commands =====

#[tauri::command]
async fn get_tags(db: tauri::State<'_, Db>) -> Result<Vec<outreach_core::models::Tag>, AppError> {
    let pool = db.pool();
    let tags = sqlx::query_as::<sqlx::Sqlite, outreach_core::models::Tag>(
        "SELECT * FROM tags ORDER BY name ASC",
    )
    .fetch_all(pool)
    .await?;
    Ok(tags)
}

#[tauri::command]
async fn create_tag(
    db: tauri::State<'_, Db>,
    name: String,
    color: String,
) -> Result<String, String> {
    let pool = db.pool();
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO tags (id, name, color) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(name)
        .bind(color)
        .execute(pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(id)
}

#[tauri::command]
async fn update_tag(
    db: tauri::State<'_, Db>,
    id: String,
    name: String,
    color: String,
) -> Result<(), String> {
    let pool = db.pool();
    sqlx::query("UPDATE tags SET name = ?, color = ? WHERE id = ?")
        .bind(name)
        .bind(color)
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn delete_tag(db: tauri::State<'_, Db>, id: String) -> Result<(), String> {
    let pool = db.pool();
    sqlx::query("DELETE FROM tags WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn assign_tag(
    db: tauri::State<'_, Db>,
    contact_id: String,
    tag_id: String,
) -> Result<(), AppError> {
    let pool = db.pool();
    sqlx::query("INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)")
        .bind(contact_id)
        .bind(tag_id)
        .execute(pool)
        .await?;
    Ok(())
}

#[tauri::command]
async fn unassign_tag(
    db: tauri::State<'_, Db>,
    contact_id: String,
    tag_id: String,
) -> Result<(), AppError> {
    let pool = db.pool();
    sqlx::query("DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?")
        .bind(contact_id)
        .bind(tag_id)
        .execute(pool)
        .await?;
    Ok(())
}

// ===== Email Credential Commands =====

#[derive(serde::Serialize, serde::Deserialize)]
struct EmailCredentialStatus {
    gmail_configured: bool,
    outlook_configured: bool,
}

#[tauri::command]
async fn check_email_credentials() -> Result<EmailCredentialStatus, AppError> {
    Ok(EmailCredentialStatus {
        gmail_configured: outreach_core::crypto::has_credentials("gmail"),
        outlook_configured: outreach_core::crypto::has_credentials("outlook"),
    })
}

#[tauri::command]
async fn save_email_credentials(
    provider: String,
    client_id: String,
    client_secret: String,
) -> Result<(), AppError> {
    outreach_core::crypto::store_credential(&provider, "client_id", &client_id)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    outreach_core::crypto::store_credential(&provider, "client_secret", &client_secret)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(())
}

// ===== App Lock Screen Commands =====

#[tauri::command]
async fn set_lock_pin(db: tauri::State<'_, Db>, pin: String) -> Result<(), AppError> {
    use outreach_core::settings::SettingsManager;

    let manager = SettingsManager::new(db.pool().clone());
    let stored = outreach_core::crypto::create_pin_data(&pin);

    manager
        .set("app_lock_pin_hash", &stored)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(())
}

#[tauri::command]
async fn verify_lock_pin(db: tauri::State<'_, Db>, pin: String) -> Result<bool, AppError> {
    use outreach_core::settings::SettingsManager;

    let manager = SettingsManager::new(db.pool().clone());
    let stored = manager
        .get("app_lock_pin_hash")
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    match stored {
        Some(hash) => Ok(outreach_core::crypto::verify_pin_against_hash(&pin, &hash)),
        None => Err(AppError::Internal("No PIN configured".to_string())),
    }
}

#[tauri::command]
async fn has_lock_pin(db: tauri::State<'_, Db>) -> Result<bool, AppError> {
    use outreach_core::settings::SettingsManager;

    let manager = SettingsManager::new(db.pool().clone());
    let stored = manager
        .get("app_lock_pin_hash")
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(stored.is_some())
}

#[tauri::command]
async fn remove_lock_pin(db: tauri::State<'_, Db>) -> Result<(), AppError> {
    // Delete from DB
    let pool = db.pool();
    sqlx::query("DELETE FROM settings WHERE key = 'app_lock_pin_hash'")
        .execute(pool)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(())
}
