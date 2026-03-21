use outreach_core::Db;
use tauri::Manager;

mod error;
use error::AppError;
mod scheduler; // Added scheduler module
mod utils; // Added utils module

pub fn extract_linkedin_slug(url: &str) -> Option<&str> {
    // Match /in/username or /pub/username patterns
    url.split("/in/")
        .nth(1)
        .or_else(|| url.split("/pub/").nth(1))
        .map(|s| s.split('/').next().unwrap_or(s))
        .map(|s| s.split('?').next().unwrap_or(s))
}

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
            s.color as status_color,
            (
                SELECT MIN(d)
                FROM (
                    SELECT c.next_contact_date AS d WHERE c.next_contact_date IS NOT NULL
                    UNION ALL
                    SELECT MIN(event_at) AS d 
                    FROM contact_events 
                    WHERE contact_id = c.id 
                      AND event_type = 'user_event' 
                      AND event_at >= CURRENT_TIMESTAMP
                )
            ) as effective_next_date
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
async fn get_contact_by_id(
    db: tauri::State<'_, Db>,
    id: String,
) -> Result<ContactWithTags, AppError> {
    let pool = db.pool();

    let contact = sqlx::query_as::<sqlx::Sqlite, outreach_core::models::Contact>(
        r#"
        SELECT 
            c.*, 
            s.label as status_label, 
            s.color as status_color,
            (
                SELECT MIN(d)
                FROM (
                    SELECT c.next_contact_date AS d WHERE c.next_contact_date IS NOT NULL
                    UNION ALL
                    SELECT MIN(event_at) AS d 
                    FROM contact_events 
                    WHERE contact_id = c.id 
                      AND event_type = 'user_event' 
                      AND event_at >= CURRENT_TIMESTAMP
                )
            ) as effective_next_date
        FROM contacts c 
        LEFT JOIN statuses s ON c.status_id = s.id
        WHERE c.id = ?
        "#,
    )
    .bind(&id)
    .fetch_optional(pool)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?
    .ok_or_else(|| AppError::Validation(format!("Contact '{}' not found", id)))?;

    let tags = sqlx::query_as::<sqlx::Sqlite, outreach_core::models::Tag>(
        r#"
        SELECT t.*
        FROM tags t
        JOIN contact_tags ct ON t.id = ct.tag_id
        WHERE ct.contact_id = ?
        "#,
    )
    .bind(&id)
    .fetch_all(pool)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(ContactWithTags { contact, tags })
}

#[tauri::command]
async fn get_statuses(
    db: tauri::State<'_, Db>,
) -> Result<Vec<outreach_core::models::Status>, AppError> {
    let pool = db.pool();
    let statuses = sqlx::query_as::<sqlx::Sqlite, outreach_core::models::Status>(
        "SELECT id, label, color, position, is_default FROM statuses ORDER BY position ASC",
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
struct StatusPosition {
    id: String,
    position: i32,
}

#[tauri::command]
async fn reorder_statuses(
    db: tauri::State<'_, Db>,
    positions: Vec<StatusPosition>,
) -> Result<(), AppError> {
    let pool = db.pool();
    let mut tx = pool.begin().await?;
    for sp in positions {
        sqlx::query("UPDATE statuses SET position = ? WHERE id = ?")
            .bind(sp.position)
            .bind(&sp.id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
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
    #[serde(rename = "summary")]
    pub intelligence_summary: Option<String>,
}

#[tauri::command]
async fn update_contact(db: tauri::State<'_, Db>, args: UpdateContactArgs) -> Result<(), AppError> {
    let pool = db.pool();

    // If status_id is provided, look up the label to keep legacy 'status' field in sync
    let mut resolved_status_label = args.status;
    if let Some(ref sid) = args.status_id {
        if let Some(label) =
            sqlx::query_scalar::<_, String>("SELECT label FROM statuses WHERE id = ?")
                .bind(sid)
                .fetch_optional(pool)
                .await
                .map_err(|e: sqlx::Error| e.to_string())?
        {
            resolved_status_label = Some(label);
        }
    }

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
    .bind(&resolved_status_label)
    .bind(&args.status_id)
    .bind(args.last_contacted_date)
    .bind(args.next_contact_date)
    .bind(args.cadence_stage)
    .bind(args.title)
    .bind(args.company)
    .bind(args.location)
    .bind(args.company_website)
    .bind(args.intelligence_summary)
    .bind(&args.id)
    .execute(pool)
    .await?;

    // Write a status_change activity event when status_id is explicitly changed.
    // Errors here are intentionally ignored — the contact update already succeeded.
    if let (Some(_), Some(ref label)) = (&args.status_id, &resolved_status_label) {
        let event_id = uuid::Uuid::new_v4().to_string();
        let title = format!("Moved to {}", label);
        let _ = sqlx::query(
            "INSERT INTO contact_events (id, contact_id, title, description, event_at, event_type) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'activity')",
        )
        .bind(&event_id)
        .bind(&args.id)
        .bind(&title)
        .bind(Option::<String>::None)
        .execute(pool)
        .await;
    }

    Ok(())
}

#[tauri::command]
async fn clear_contact_next_date(db: tauri::State<'_, Db>, id: String) -> Result<(), AppError> {
    let pool = db.pool();
    sqlx::query("UPDATE contacts SET next_contact_date = NULL WHERE id = ?")
        .bind(&id)
        .execute(pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle();
            #[cfg(debug_assertions)]
            println!("[Boot] Starting OutreachOS production diagnostics...");

            let app_dir = app_handle
                .path()
                .app_data_dir()
                .map_err(|e| {
                    #[cfg(debug_assertions)]
                    eprintln!("[Boot Error] Failed to get app data dir: {}", e);
                    e
                })
                .expect("failed to get app data dir");

            #[cfg(debug_assertions)]
            println!("[Boot] App Data Dir: {:?}", app_dir);

            // Ensure directory exists
            std::fs::create_dir_all(&app_dir)
                .map_err(|e| {
                    #[cfg(debug_assertions)]
                    eprintln!("[Boot Error] Failed to create app data dir: {}", e);
                    e
                })
                .expect("failed to create app data dir");

            let db_path = app_dir.join("outreach.db");
            let db_path_str = db_path.to_str().expect("invalid path");
            #[cfg(debug_assertions)]
            println!("[Boot] Database Path: {}", db_path_str);

            let db = tauri::async_runtime::block_on(async {
                #[cfg(debug_assertions)]
                println!("[Boot] Initializing Core Database...");
                let result = Db::new(db_path_str)
                    .await
                    .map_err(|e| {
                        #[cfg(debug_assertions)]
                        eprintln!("[Boot Error] Database initialization failed: {:?}", e);
                        e
                    })
                    .expect("failed to init core");
                #[cfg(debug_assertions)]
                println!("[Boot] Core Database Initialized.");
                result
            });

            #[cfg(debug_assertions)]
            println!("[Boot] Starting Email Scheduler...");
            scheduler::start_email_scheduler(app_handle.clone(), db.clone());

            #[cfg(debug_assertions)]
            println!("[Boot] Setup complete, managing state.");
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
            reorder_statuses,
            add_contact,
            update_contact,
            delete_contact,
            clear_contact_next_date,
            get_email_accounts,
            gmail_connect,
            outlook_connect,
            email_send,
            delete_email_account,
            email_schedule,
            get_emails_for_contact,
            get_contact_events,
            get_contact_activity,
            create_contact_event,
            update_contact_event,
            delete_contact_event,
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
            get_contact_by_id,
            sync_email_accounts,
            sync_email_account,
            reset_email_sync_state,
            set_lock_pin,
            verify_lock_pin,
            has_lock_pin,
            remove_lock_pin,
            get_email_templates,
            upsert_email_template,
            delete_email_template,
            get_scheduled_emails,
            cancel_scheduled_email,
            update_scheduled_email,
            get_signatures,
            upsert_signature,
            delete_signature,
            get_contact_files,
            attach_file,
            delete_contact_file,
            open_contact_file,
            utils::open_external_url,
            check_for_update
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn fix_orphan_contacts(db: tauri::State<'_, Db>) -> Result<String, AppError> {
    let pool = db.pool();

    // Only seed defaults on a completely fresh install (empty statuses table).
    // Do NOT run INSERT OR IGNORE unconditionally — that would restore any status
    // the user intentionally deleted.
    let status_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM statuses")
        .fetch_one(pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    if status_count == 0 {
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
    }

    // Cleanup legacy status rows (safe to always run)
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

    // Determine the fallback status (default or first by position)
    let fallback: Option<String> = sqlx::query_scalar(
        "SELECT id FROM statuses ORDER BY is_default DESC, position ASC LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;

    if let Some(ref fallback_id) = fallback {
        // Fix NULL status_id
        sqlx::query("UPDATE contacts SET status_id = ? WHERE status_id IS NULL")
            .bind(fallback_id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;

        // Fix legacy def-stat-* IDs
        sqlx::query("UPDATE contacts SET status_id = ? WHERE status_id LIKE 'def-stat-%'")
            .bind(fallback_id)
            .execute(pool)
            .await
            .map_err(|e| e.to_string())?;

        // Fix contacts whose status_id references a status that no longer exists.
        // Use the actual statuses table — not a hardcoded list — so user-created
        // custom statuses are never mistakenly reset.
        sqlx::query(
            "UPDATE contacts SET status_id = ? WHERE status_id IS NOT NULL AND status_id NOT IN (SELECT id FROM statuses)",
        )
        .bind(fallback_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;
    }

    Ok("ok".to_string())
}

#[tauri::command]
async fn delete_contact(db: tauri::State<'_, Db>, id: String) -> Result<(), AppError> {
    let pool = db.pool();
    sqlx::query("DELETE FROM contacts WHERE id = ?")
        .bind(&id)
        .execute(pool)
        .await?;
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
    contact_id: Option<String>,
    to: String,
    subject: String,
    body: String,
) -> Result<String, AppError> {
    let service = outreach_core::EmailService::new(db.inner().clone());
    let result = service
        .send_email(&account_id, &to, &subject, &body)
        .await
        .map_err(|e| AppError::from(e.to_string()))?;

    // Write an email_sent activity event if this email is linked to a contact.
    // Errors here are intentionally ignored — the send already succeeded.
    if let Some(ref cid) = contact_id {
        let pool = db.pool();
        let event_id = uuid::Uuid::new_v4().to_string();
        let title = format!("Email sent: {}", subject);
        let _ = sqlx::query(
            "INSERT INTO contact_events (id, contact_id, title, description, event_at, event_type) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'activity')",
        )
        .bind(&event_id)
        .bind(cid)
        .bind(&title)
        .bind(Option::<String>::None)
        .execute(pool)
        .await;
    }

    Ok(result)
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
    let result = service
        .schedule_email(&account_id, &contact_id, &subject, &body, scheduled_at)
        .await
        .map_err(|e| AppError::from(e.to_string()))?;

    // Write an email_scheduled activity event.
    // Errors here are intentionally ignored — the schedule already succeeded.
    let pool = db.pool();
    let event_id = uuid::Uuid::new_v4().to_string();
    let title = format!("Email scheduled: {}", subject);
    let _ = sqlx::query(
        "INSERT INTO contact_events (id, contact_id, title, description, event_at, event_type) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'activity')",
    )
    .bind(&event_id)
    .bind(&contact_id)
    .bind(&title)
    .bind(Option::<String>::None)
    .execute(pool)
    .await;

    Ok(result)
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct ContactFileRow {
    id: String,
    contact_id: String,
    filename: String,
    file_path: String,
    created_at: chrono::DateTime<chrono::Utc>,
}

#[tauri::command]
async fn get_contact_files(
    db: tauri::State<'_, Db>,
    contact_id: String,
) -> Result<Vec<ContactFileRow>, AppError> {
    let rows = sqlx::query_as::<_, ContactFileRow>(
        "SELECT id, contact_id, filename, file_path, created_at
         FROM contact_files WHERE contact_id = ? ORDER BY created_at ASC",
    )
    .bind(&contact_id)
    .fetch_all(db.pool())
    .await?;
    Ok(rows)
}

#[tauri::command]
async fn attach_file(
    app_handle: tauri::AppHandle,
    db: tauri::State<'_, Db>,
    contact_id: String,
    src_path: String,
) -> Result<ContactFileRow, AppError> {
    let src = std::path::Path::new(&src_path);
    let filename = src
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| AppError::from("Invalid file path".to_string()))?
        .to_string();

    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| AppError::from(e.to_string()))?;
    let files_dir = app_dir.join("files");
    std::fs::create_dir_all(&files_dir).map_err(|e| AppError::from(e.to_string()))?;

    let file_id = uuid::Uuid::new_v4().to_string();
    let dest_name = format!("{}_{}", file_id, filename);
    let dest_path = files_dir.join(&dest_name);
    std::fs::copy(src, &dest_path).map_err(|e| AppError::from(e.to_string()))?;

    let dest_str = dest_path
        .to_str()
        .ok_or_else(|| AppError::from("Invalid destination path".to_string()))?
        .to_string();

    sqlx::query(
        "INSERT INTO contact_files (id, contact_id, filename, file_path) VALUES (?, ?, ?, ?)",
    )
    .bind(&file_id)
    .bind(&contact_id)
    .bind(&filename)
    .bind(&dest_str)
    .execute(db.pool())
    .await?;

    let row = sqlx::query_as::<_, ContactFileRow>(
        "SELECT id, contact_id, filename, file_path, created_at FROM contact_files WHERE id = ?",
    )
    .bind(&file_id)
    .fetch_one(db.pool())
    .await?;

    Ok(row)
}

#[tauri::command]
async fn delete_contact_file(db: tauri::State<'_, Db>, id: String) -> Result<(), AppError> {
    let row = sqlx::query_as::<_, ContactFileRow>(
        "SELECT id, contact_id, filename, file_path, created_at FROM contact_files WHERE id = ?",
    )
    .bind(&id)
    .fetch_optional(db.pool())
    .await?;

    if let Some(r) = row {
        let _ = std::fs::remove_file(&r.file_path); // best-effort
    }

    sqlx::query("DELETE FROM contact_files WHERE id = ?")
        .bind(&id)
        .execute(db.pool())
        .await?;

    Ok(())
}

#[tauri::command]
async fn open_contact_file(db: tauri::State<'_, Db>, id: String) -> Result<(), AppError> {
    let row = sqlx::query_as::<_, ContactFileRow>(
        "SELECT id, contact_id, filename, file_path, created_at FROM contact_files WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(db.pool())
    .await?;

    open::that(&row.file_path).map_err(|e| AppError::from(e.to_string()))?;
    Ok(())
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct EmailSignatureRow {
    id: String,
    name: String,
    content: String,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[tauri::command]
async fn get_signatures(db: tauri::State<'_, Db>) -> Result<Vec<EmailSignatureRow>, AppError> {
    let rows = sqlx::query_as::<_, EmailSignatureRow>(
        "SELECT id, name, content, created_at, updated_at FROM email_signatures ORDER BY name ASC",
    )
    .fetch_all(db.pool())
    .await?;
    Ok(rows)
}

#[tauri::command]
async fn upsert_signature(
    db: tauri::State<'_, Db>,
    id: Option<String>,
    name: String,
    content: String,
) -> Result<(), AppError> {
    let sig_id = id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    sqlx::query(
        "INSERT INTO email_signatures (id, name, content)
         VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, content = excluded.content",
    )
    .bind(&sig_id)
    .bind(&name)
    .bind(&content)
    .execute(db.pool())
    .await?;
    Ok(())
}

#[tauri::command]
async fn delete_signature(db: tauri::State<'_, Db>, id: String) -> Result<(), AppError> {
    sqlx::query("DELETE FROM email_signatures WHERE id = ?")
        .bind(&id)
        .execute(db.pool())
        .await?;
    Ok(())
}

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
struct ScheduledEmailRow {
    id: String,
    contact_id: String,
    contact_first_name: String,
    contact_last_name: String,
    account_id: String,
    subject: String,
    body: String,
    scheduled_at: chrono::DateTime<chrono::Utc>,
    status: String,
    error_message: Option<String>,
    created_at: chrono::DateTime<chrono::Utc>,
}

#[tauri::command]
async fn get_scheduled_emails(
    db: tauri::State<'_, Db>,
    contact_id: Option<String>,
) -> Result<Vec<ScheduledEmailRow>, AppError> {
    let pool = db.pool();
    let rows = if let Some(cid) = contact_id {
        sqlx::query_as::<_, ScheduledEmailRow>(
            "SELECT se.id, se.contact_id,
                    COALESCE(c.first_name, '') AS contact_first_name,
                    COALESCE(c.last_name, '') AS contact_last_name,
                    se.account_id, se.subject, se.body, se.scheduled_at, se.status,
                    se.error_message, se.created_at
             FROM scheduled_emails se
             LEFT JOIN contacts c ON se.contact_id = c.id
             WHERE se.contact_id = ?
             ORDER BY se.scheduled_at ASC",
        )
        .bind(cid)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, ScheduledEmailRow>(
            "SELECT se.id, se.contact_id,
                    COALESCE(c.first_name, '') AS contact_first_name,
                    COALESCE(c.last_name, '') AS contact_last_name,
                    se.account_id, se.subject, se.body, se.scheduled_at, se.status,
                    se.error_message, se.created_at
             FROM scheduled_emails se
             LEFT JOIN contacts c ON se.contact_id = c.id
             ORDER BY se.scheduled_at ASC",
        )
        .fetch_all(pool)
        .await?
    };
    Ok(rows)
}

#[tauri::command]
async fn cancel_scheduled_email(db: tauri::State<'_, Db>, id: String) -> Result<(), AppError> {
    let pool = db.pool();
    sqlx::query("DELETE FROM scheduled_emails WHERE id = ?")
        .bind(&id)
        .execute(pool)
        .await?;
    Ok(())
}

#[tauri::command]
async fn update_scheduled_email(
    db: tauri::State<'_, Db>,
    id: String,
    subject: String,
    body: String,
    scheduled_at: i64,
) -> Result<(), AppError> {
    let pool = db.pool();
    let scheduled_time = chrono::DateTime::from_timestamp(scheduled_at, 0)
        .ok_or_else(|| AppError::Internal("Invalid timestamp".into()))?;
    sqlx::query(
        "UPDATE scheduled_emails SET subject = ?, body = ?, scheduled_at = ? WHERE id = ? AND status = 'pending'"
    )
    .bind(&subject)
    .bind(&body)
    .bind(scheduled_time)
    .bind(&id)
    .execute(pool)
    .await?;
    Ok(())
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
async fn save_api_key(
    db: tauri::State<'_, Db>,
    service: String,
    key: String,
) -> Result<(), AppError> {
    #[cfg(debug_assertions)]
    println!("--- [DB Debug] Saving key for service: {} ---", service);
    let manager = outreach_core::settings::SettingsManager::new(db.pool().clone());
    manager
        .set(&service, &key)
        .await
        .map_err(|e| e.to_string())?;
    #[cfg(debug_assertions)]
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

    let contacts = sqlx::query_as::<sqlx::Sqlite, outreach_core::models::Contact>(
        "SELECT id, company_id, first_name, last_name, email, linkedin_url, title, company, location, company_website, status, status_id, status_label, status_color, intelligence_summary, last_interaction_at, last_contacted_date, next_contact_date, NULL as effective_next_date, NULL as next_contact_event, cadence_stage, created_at, updated_at FROM contacts"
    )
    .fetch_all(pool)
    .await?;

    let statuses = sqlx::query_as::<sqlx::Sqlite, outreach_core::models::Status>(
        "SELECT id, label, color, position, is_default FROM statuses",
    )
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
    if key == "outlook_client_id" {
        outreach_core::crypto::store_secret("outlook_client_id", &value)
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
async fn delete_contacts_bulk(db: tauri::State<'_, Db>, ids: Vec<String>) -> Result<u64, AppError> {
    let pool = db.pool();
    let mut tx = pool.begin().await?;

    let mut deleted_count = 0;

    for id in ids {
        let result = sqlx::query("DELETE FROM contacts WHERE id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        deleted_count += result.rows_affected();
    }

    tx.commit().await?;

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
        "SELECT id, name, color, created_at FROM tags ORDER BY name ASC",
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
) -> Result<String, AppError> {
    let pool = db.pool();
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO tags (id, name, color) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(name)
        .bind(color)
        .execute(pool)
        .await?;
    Ok(id)
}

#[tauri::command]
async fn update_tag(
    db: tauri::State<'_, Db>,
    id: String,
    name: String,
    color: String,
) -> Result<(), AppError> {
    let pool = db.pool();
    sqlx::query("UPDATE tags SET name = ?, color = ? WHERE id = ?")
        .bind(name)
        .bind(color)
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

#[tauri::command]
async fn delete_tag(db: tauri::State<'_, Db>, id: String) -> Result<(), AppError> {
    let pool = db.pool();
    sqlx::query("DELETE FROM tags WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
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
        .bind(&contact_id)
        .bind(&tag_id)
        .execute(pool)
        .await?;

    // Write a tag_added activity event. Look up the tag name for a readable title.
    // Errors here are intentionally ignored — the assignment already succeeded.
    let tag_name: Option<String> =
        sqlx::query_scalar::<_, String>("SELECT name FROM tags WHERE id = ?")
            .bind(&tag_id)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();
    if let Some(name) = tag_name {
        let event_id = uuid::Uuid::new_v4().to_string();
        let title = format!("Tag added: {}", name);
        let _ = sqlx::query(
            "INSERT INTO contact_events (id, contact_id, title, description, event_at, event_type) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'activity')",
        )
        .bind(&event_id)
        .bind(&contact_id)
        .bind(&title)
        .bind(Option::<String>::None)
        .execute(pool)
        .await;
    }

    Ok(())
}

#[tauri::command]
async fn unassign_tag(
    db: tauri::State<'_, Db>,
    contact_id: String,
    tag_id: String,
) -> Result<(), AppError> {
    let pool = db.pool();
    // Look up tag name BEFORE deleting — the tag record still exists, only the assignment is removed.
    let tag_name: Option<String> =
        sqlx::query_scalar::<_, String>("SELECT name FROM tags WHERE id = ?")
            .bind(&tag_id)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();

    sqlx::query("DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?")
        .bind(&contact_id)
        .bind(&tag_id)
        .execute(pool)
        .await?;

    // Write a tag_removed activity event.
    // Errors here are intentionally ignored — the unassignment already succeeded.
    if let Some(name) = tag_name {
        let event_id = uuid::Uuid::new_v4().to_string();
        let title = format!("Tag removed: {}", name);
        let _ = sqlx::query(
            "INSERT INTO contact_events (id, contact_id, title, description, event_at, event_type) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'activity')",
        )
        .bind(&event_id)
        .bind(&contact_id)
        .bind(&title)
        .bind(Option::<String>::None)
        .execute(pool)
        .await;
    }

    Ok(())
}

// ===== Email Template Commands =====

#[tauri::command]
async fn get_email_templates(
    db: tauri::State<'_, Db>,
) -> Result<Vec<outreach_core::models::EmailTemplate>, AppError> {
    let pool = db.pool();
    let templates = sqlx::query_as::<sqlx::Sqlite, outreach_core::models::EmailTemplate>(
        "SELECT id, name, subject, body, created_at, updated_at FROM email_templates ORDER BY name ASC",
    )
    .fetch_all(pool)
    .await?;
    Ok(templates)
}

#[tauri::command]
async fn upsert_email_template(
    db: tauri::State<'_, Db>,
    id: Option<String>,
    name: String,
    subject: Option<String>,
    body: Option<String>,
) -> Result<String, AppError> {
    let pool = db.pool();
    let template_id = id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());

    sqlx::query(
        r#"
        INSERT INTO email_templates (id, name, subject, body, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET 
            name = excluded.name,
            subject = excluded.subject,
            body = excluded.body,
            updated_at = CURRENT_TIMESTAMP
        "#,
    )
    .bind(&template_id)
    .bind(name)
    .bind(subject)
    .bind(body)
    .execute(pool)
    .await?;

    Ok(template_id)
}

#[tauri::command]
async fn delete_email_template(db: tauri::State<'_, Db>, id: String) -> Result<(), AppError> {
    let pool = db.pool();
    sqlx::query("DELETE FROM email_templates WHERE id = ?")
        .bind(id)
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

// ===== Contact Event Commands =====

#[tauri::command]
async fn get_contact_events(
    db: tauri::State<'_, Db>,
    contact_id: String,
) -> Result<Vec<outreach_core::models::ContactEvent>, AppError> {
    let pool = db.pool();
    // Only return user-created events (meetings, calls, etc.) — NOT system activity
    let events = sqlx::query_as::<_, outreach_core::models::ContactEvent>(
        "SELECT id, contact_id, title, description, event_at, created_at, updated_at FROM contact_events WHERE contact_id = ? AND event_type = 'user_event' ORDER BY event_at ASC",
    )
    .bind(contact_id)
    .fetch_all(pool)
    .await?;
    Ok(events)
}

#[tauri::command]
async fn get_contact_activity(
    db: tauri::State<'_, Db>,
    contact_id: String,
) -> Result<Vec<outreach_core::models::ContactEvent>, AppError> {
    let pool = db.pool();
    // Only return system-generated activity events for the Activity tab
    let events = sqlx::query_as::<_, outreach_core::models::ContactEvent>(
        "SELECT id, contact_id, title, description, event_at, created_at, updated_at FROM contact_events WHERE contact_id = ? AND event_type = 'activity' ORDER BY event_at DESC",
    )
    .bind(contact_id)
    .fetch_all(pool)
    .await?;
    Ok(events)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateContactEventArgs {
    contact_id: String,
    title: String,
    description: Option<String>,
    event_at: chrono::DateTime<chrono::Utc>,
}

#[tauri::command]
async fn create_contact_event(
    db: tauri::State<'_, Db>,
    args: CreateContactEventArgs,
) -> Result<String, AppError> {
    let pool = db.pool();
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO contact_events (id, contact_id, title, description, event_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(args.contact_id)
    .bind(args.title)
    .bind(args.description)
    .bind(args.event_at)
    .execute(pool)
    .await?;
    Ok(id)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateContactEventArgs {
    id: String,
    title: Option<String>,
    description: Option<String>,
    event_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[tauri::command]
async fn update_contact_event(
    db: tauri::State<'_, Db>,
    args: UpdateContactEventArgs,
) -> Result<(), AppError> {
    let pool = db.pool();
    sqlx::query(
        "UPDATE contact_events SET 
            title = COALESCE(?, title), 
            description = COALESCE(?, description), 
            event_at = COALESCE(?, event_at),
            updated_at = CURRENT_TIMESTAMP
         WHERE id = ?",
    )
    .bind(args.title)
    .bind(args.description)
    .bind(args.event_at)
    .bind(args.id)
    .execute(pool)
    .await?;
    Ok(())
}

#[tauri::command]
async fn delete_contact_event(db: tauri::State<'_, Db>, id: String) -> Result<(), AppError> {
    let pool = db.pool();
    sqlx::query("DELETE FROM contact_events WHERE id = ?")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

// ===== Update Check =====

#[tauri::command]
async fn check_for_update() -> Result<String, AppError> {
    #[cfg(debug_assertions)]
    println!("[update] checking GitHub for latest release...");

    let client = reqwest::Client::builder()
        .user_agent("OutreachOS")
        .build()
        .map_err(|e| AppError::Network(e.to_string()))?;

    let res = client
        .get("https://api.github.com/repos/Gitter09/outreach-os/releases/latest")
        .header("Accept", "application/vnd.github+json")
        .send()
        .await
        .map_err(|e| {
            #[cfg(debug_assertions)]
            println!("[update] request failed: {e}");
            AppError::Network(e.to_string())
        })?;

    #[cfg(debug_assertions)]
    println!("[update] response status: {}", res.status());

    if !res.status().is_success() {
        #[cfg(debug_assertions)]
        println!("[update] non-success status, skipping");
        return Ok(String::new());
    }

    let data: serde_json::Value = res
        .json()
        .await
        .map_err(|e| AppError::Network(e.to_string()))?;

    let tag = data["tag_name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches('v')
        .to_string();

    #[cfg(debug_assertions)]
    println!("[update] latest tag: {:?}", tag);

    Ok(tag)
}
