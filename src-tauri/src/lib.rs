use jobdex_core::Db;
use tauri::Manager;

mod error;
use error::AppError;
#[cfg(target_os = "macos")]
mod launchagent;
mod scheduler;
mod tray;
mod utils;

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
    contact: jobdex_core::models::Contact,
    tags: Vec<jobdex_core::models::Tag>,
}

#[tauri::command]
async fn get_contacts(db: tauri::State<'_, Db>) -> Result<Vec<ContactWithTags>, AppError> {
    let pool = db.pool();

    // 1. Fetch Contacts
    let contacts = sqlx::query_as::<sqlx::Sqlite, jobdex_core::models::Contact>(
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
    let mut tags_by_contact: HashMap<String, Vec<jobdex_core::models::Tag>> = HashMap::new();

    for a in assignments {
        tags_by_contact
            .entry(a.contact_id)
            .or_default()
            .push(jobdex_core::models::Tag {
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

    let contact = sqlx::query_as::<sqlx::Sqlite, jobdex_core::models::Contact>(
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

    let tags = sqlx::query_as::<sqlx::Sqlite, jobdex_core::models::Tag>(
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
) -> Result<Vec<jobdex_core::models::Status>, AppError> {
    let pool = db.pool();
    let statuses = sqlx::query_as::<sqlx::Sqlite, jobdex_core::models::Status>(
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
        let default_status: Option<(String, String)> = sqlx::query_as(
            "SELECT id, label FROM statuses ORDER BY position ASC LIMIT 1",
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

#[tauri::command]
async fn enable_background_service() -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    {
        launchagent::enable()?;
    }
    Ok(())
}

#[tauri::command]
async fn disable_background_service() -> Result<(), AppError> {
    #[cfg(target_os = "macos")]
    {
        launchagent::disable()?;
    }
    Ok(())
}

#[tauri::command]
async fn is_background_service_enabled() -> Result<bool, AppError> {
    #[cfg(target_os = "macos")]
    {
        return launchagent::is_enabled();
    }
    #[cfg(not(target_os = "macos"))]
    {
        Ok(false)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_handle = app.handle();
            #[cfg(debug_assertions)]
            println!("[Boot] Starting JobDex production diagnostics...");

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

            let db_path = app_dir.join("jobdex.db");
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

            // System tray
            #[cfg(debug_assertions)]
            println!("[Boot] Setting up system tray...");
            tray::setup(app_handle).expect("failed to setup system tray");

            // Remove legacy AppleScript login item (fire-and-forget)
            #[cfg(target_os = "macos")]
            {
                let _ = std::process::Command::new("osascript")
                    .args([
                        "-e",
                        "tell application \"System Events\" to delete login item \"JobDex\"",
                    ])
                    .output();
            }

            // If launched with --background flag (via LaunchAgent), hide the main window
            if std::env::args().any(|a| a == "--background") {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

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
            get_all_emails,
            get_attachments_for_message,
            open_attachment,
            get_contact_events,
            get_contact_activity,
            create_contact_event,
            update_contact_event,
            delete_contact_event,
            save_api_key,
            get_settings,
            save_setting,
            export_all_data,
            export_all_data_to_path,
            import_all_data,
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
            check_for_update,
            enable_background_service,
            disable_background_service,
            is_background_service_enabled
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if !tray::should_exit() {
                    api.prevent_close();
                    let _ = window.hide();
                } else {
                    scheduler::stop_email_scheduler();
                }
            }
        })
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
        "SELECT id FROM statuses ORDER BY position ASC LIMIT 1",
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
    let mut tx = pool.begin().await?;

    sqlx::query("DELETE FROM contact_events WHERE contact_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM contact_tags WHERE contact_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM contact_files WHERE contact_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM scheduled_emails WHERE contact_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;

    sqlx::query("DELETE FROM contacts WHERE id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;
    Ok(())
}

// ===== Gmail Commands =====

#[tauri::command]
async fn get_email_accounts(
    db: tauri::State<'_, Db>,
) -> Result<Vec<jobdex_core::models::EmailAccount>, AppError> {
    let service = jobdex_core::EmailService::new(db.inner().clone());
    service
        .list_accounts()
        .await
        .map_err(|e| AppError::from(e.to_string()))
}

#[tauri::command]
async fn gmail_connect(db: tauri::State<'_, Db>) -> Result<String, AppError> {
    use std::net::TcpListener;
    use std::thread;

    let client = jobdex_core::gmail::GmailClient::new();

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
    let client = jobdex_core::gmail::GmailClient::new();
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
    let service = jobdex_core::EmailService::new(db.inner().clone());
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

    let client = jobdex_core::outlook::OutlookClient::new();

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

    let client = jobdex_core::outlook::OutlookClient::new();
    let tokens = client
        .exchange_code(code, pkce_verifier, port)
        .await
        .map_err(|e| e.to_string())?;

    let email = client
        .get_user_profile(&tokens.access_token)
        .await
        .map_err(|e| e.to_string())?;

    let service = jobdex_core::EmailService::new(db.inner().clone());
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
    attachment_paths: Vec<String>,
) -> Result<String, AppError> {
    let service = jobdex_core::EmailService::new(db.inner().clone());
    let result = service
        .send_email(&account_id, &to, &subject, &body, attachment_paths)
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
    attachment_paths: Vec<String>,
) -> Result<String, AppError> {
    let service = jobdex_core::EmailService::new(db.inner().clone());
    let result = service
        .schedule_email(&account_id, &contact_id, &subject, &body, scheduled_at, attachment_paths)
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
    attachment_paths: String,
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
                    se.error_message, se.created_at,
                    COALESCE(se.attachment_paths, '[]') AS attachment_paths
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
                    se.error_message, se.created_at,
                    COALESCE(se.attachment_paths, '[]') AS attachment_paths
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
) -> Result<Vec<jobdex_core::models::EmailMessage>, AppError> {
    let service = jobdex_core::EmailService::new(db.inner().clone());
    service
        .get_emails_for_contact(&contact_id)
        .await
        .map_err(|e| e.to_string().into())
}

#[tauri::command]
async fn get_attachments_for_message(
    db: tauri::State<'_, Db>,
    message_id: String,
) -> Result<Vec<jobdex_core::models::EmailAttachment>, AppError> {
    let service = jobdex_core::EmailService::new(db.inner().clone());
    service
        .get_attachments_for_message(&message_id)
        .await
        .map_err(|e| e.to_string().into())
}

#[tauri::command]
fn open_attachment(file_path: String) -> Result<(), AppError> {
    open::that(&file_path).map_err(|e| format!("Failed to open attachment: {}", e).into())
}

#[tauri::command]
async fn get_all_emails(
    db: tauri::State<'_, Db>,
    status_filter: Option<String>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> Result<Vec<jobdex_core::models::EmailMessage>, AppError> {
    let service = jobdex_core::EmailService::new(db.inner().clone());
    service
        .get_all_emails(
            status_filter.as_deref(),
            limit.unwrap_or(100),
            offset.unwrap_or(0),
        )
        .await
        .map_err(|e| e.to_string().into())
}

#[tauri::command]
async fn delete_email_account(
    db: tauri::State<'_, Db>,
    account_id: String,
) -> Result<(), AppError> {
    let service = jobdex_core::EmailService::new(db.inner().clone());
    service
        .delete_account(&account_id)
        .await
        .map_err(|e| AppError::from(e.to_string()))
}

#[tauri::command]
async fn sync_email_accounts(
    db: tauri::State<'_, Db>,
) -> Result<Vec<jobdex_core::SyncResult>, AppError> {
    let service = jobdex_core::EmailService::new(db.inner().clone());
    service
        .sync_all_accounts()
        .await
        .map_err(|e| e.to_string().into())
}

#[tauri::command]
async fn sync_email_account(
    db: tauri::State<'_, Db>,
    account_id: String,
) -> Result<jobdex_core::SyncResult, AppError> {
    let service = jobdex_core::EmailService::new(db.inner().clone());
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
    let manager = jobdex_core::settings::SettingsManager::new(db.pool().clone());
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
    let manager = jobdex_core::settings::SettingsManager::new(db.pool().clone());
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

    let contacts = sqlx::query_as::<sqlx::Sqlite, jobdex_core::models::Contact>(
        r#"
        SELECT
            c.id, c.company_id, c.first_name, c.last_name, c.email, c.linkedin_url,
            c.title, c.company, c.location, c.company_website, c.status, c.status_id,
            s.label as status_label, s.color as status_color,
            c.intelligence_summary, c.last_interaction_at, c.last_contacted_date,
            c.next_contact_date, NULL as effective_next_date, c.next_contact_event,
            c.cadence_stage, c.created_at, c.updated_at
        FROM contacts c
        LEFT JOIN statuses s ON c.status_id = s.id
        "#
    )
    .fetch_all(pool)
    .await?;

    let statuses = sqlx::query_as::<sqlx::Sqlite, jobdex_core::models::Status>(
        "SELECT id, label, color, position, is_default FROM statuses",
    )
    .fetch_all(pool)
    .await?;

    let tags = sqlx::query_as::<sqlx::Sqlite, jobdex_core::models::Tag>(
        "SELECT id, name, color, created_at FROM tags",
    )
    .fetch_all(pool)
    .await?;

    #[derive(sqlx::FromRow, serde::Serialize)]
    struct ContactTagRow {
        contact_id: String,
        tag_id: String,
    }
    let contact_tags = sqlx::query_as::<sqlx::Sqlite, ContactTagRow>(
        "SELECT contact_id, tag_id FROM contact_tags",
    )
    .fetch_all(pool)
    .await?;

    let settings_map = jobdex_core::settings::SettingsManager::new(pool.clone())
        .get_all()
        .await?;

    let export = serde_json::json!({
        "version": "1.1",
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "contacts": contacts,
        "statuses": statuses,
        "tags": tags,
        "contact_tags": contact_tags,
        "settings": settings_map
    });

    Ok(serde_json::to_string_pretty(&export)?)
}

#[tauri::command]
async fn export_all_data_to_path(
    file_path: String,
    db: tauri::State<'_, Db>,
) -> Result<(), AppError> {
    if file_path.contains("..") {
        return Err(AppError::Validation("Invalid file path".to_string()));
    }
    let json = export_all_data(db).await?;
    std::fs::write(&file_path, json)?;
    Ok(())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportSummary {
    contacts_added: i32,
    contacts_updated: i32,
    statuses_added: i32,
    tags_added: i32,
}

#[tauri::command]
async fn import_all_data(
    file_path: String,
    db: tauri::State<'_, Db>,
) -> Result<ImportSummary, AppError> {
    // Validate path — no traversal
    if file_path.contains("..") {
        return Err(AppError::Validation(
            "Invalid file path: path traversal not allowed".into(),
        ));
    }

    let raw = std::fs::read_to_string(&file_path)?;
    let json: serde_json::Value = serde_json::from_str(&raw)?;

    let version = json["version"].as_str().unwrap_or("");
    if version != "1.0" && version != "1.1" {
        return Err(AppError::Validation(format!(
            "Unsupported backup version: \"{}\". Only versions 1.0 and 1.1 are supported.",
            version
        )));
    }

    let pool = db.pool();
    let mut tx = pool.begin().await?;

    let mut contacts_added: i32 = 0;
    let mut contacts_updated: i32 = 0;
    let mut statuses_added: i32 = 0;
    let mut tags_added: i32 = 0;

    // --- Statuses ---
    if let Some(statuses) = json["statuses"].as_array() {
        for s in statuses {
            let id = s["id"].as_str().unwrap_or("").to_string();
            let label = s["label"].as_str().unwrap_or("").to_string();
            let color = s["color"].as_str().unwrap_or("#6B7280").to_string();
            let position = s["position"].as_i64().unwrap_or(0) as i32;
            let is_default = s["is_default"].as_bool().unwrap_or(false);

            if id.is_empty() || label.is_empty() {
                continue;
            }

            let exists: bool = sqlx::query_scalar("SELECT COUNT(*) > 0 FROM statuses WHERE id = ?")
                .bind(&id)
                .fetch_one(&mut *tx)
                .await?;

            if !exists {
                sqlx::query(
                    "INSERT INTO statuses (id, label, color, position, is_default) VALUES (?, ?, ?, ?, ?)",
                )
                .bind(&id)
                .bind(&label)
                .bind(&color)
                .bind(position)
                .bind(is_default)
                .execute(&mut *tx)
                .await?;
                statuses_added += 1;
            }
        }
    }

    // --- Tags (v1.1 only) ---
    if version == "1.1" {
        if let Some(tags) = json["tags"].as_array() {
            for t in tags {
                let id = t["id"].as_str().unwrap_or("").to_string();
                let name = t["name"].as_str().unwrap_or("").to_string();
                let color = t["color"].as_str().unwrap_or("#6B7280").to_string();
                let created_at = t["created_at"].as_str().unwrap_or("").to_string();

                if id.is_empty() || name.is_empty() {
                    continue;
                }

                let exists: bool =
                    sqlx::query_scalar("SELECT COUNT(*) > 0 FROM tags WHERE id = ?")
                        .bind(&id)
                        .fetch_one(&mut *tx)
                        .await?;

                if !exists {
                    sqlx::query(
                        "INSERT INTO tags (id, name, color, created_at) VALUES (?, ?, ?, ?)",
                    )
                    .bind(&id)
                    .bind(&name)
                    .bind(&color)
                    .bind(&created_at)
                    .execute(&mut *tx)
                    .await?;
                    tags_added += 1;
                }
            }
        }
    }

    // --- Contacts ---
    if let Some(contacts) = json["contacts"].as_array() {
        for c in contacts {
            let id = c["id"].as_str().unwrap_or("").to_string();
            let first_name = c["first_name"].as_str().unwrap_or("").to_string();
            let last_name = c["last_name"].as_str().unwrap_or("").to_string();

            if id.is_empty() || first_name.is_empty() {
                continue;
            }

            let email = c["email"].as_str().map(|s| s.to_string());
            let linkedin_url = c["linkedin_url"].as_str().map(|s| s.to_string());

            // Match priority: email → linkedin_url → id
            let existing_id: Option<String> = if let Some(ref em) = email {
                sqlx::query_scalar("SELECT id FROM contacts WHERE email = ? LIMIT 1")
                    .bind(em)
                    .fetch_optional(&mut *tx)
                    .await?
            } else if let Some(ref li) = linkedin_url {
                sqlx::query_scalar("SELECT id FROM contacts WHERE linkedin_url = ? LIMIT 1")
                    .bind(li)
                    .fetch_optional(&mut *tx)
                    .await?
            } else {
                sqlx::query_scalar("SELECT id FROM contacts WHERE id = ? LIMIT 1")
                    .bind(&id)
                    .fetch_optional(&mut *tx)
                    .await?
            };

            if existing_id.is_some() {
                // UPDATE only null/missing fields
                sqlx::query(
                    "UPDATE contacts SET
                        first_name = COALESCE(NULLIF(first_name, ''), ?),
                        last_name = COALESCE(NULLIF(last_name, ''), ?),
                        title = COALESCE(title, ?),
                        company = COALESCE(company, ?),
                        location = COALESCE(location, ?),
                        email = COALESCE(email, ?),
                        linkedin_url = COALESCE(linkedin_url, ?),
                        company_website = COALESCE(company_website, ?),
                        status_id = COALESCE(status_id, ?),
                        intelligence_summary = COALESCE(intelligence_summary, ?),
                        last_contacted_date = COALESCE(last_contacted_date, ?),
                        next_contact_date = COALESCE(next_contact_date, ?)
                    WHERE id = ?",
                )
                .bind(&first_name)
                .bind(&last_name)
                .bind(c["title"].as_str())
                .bind(c["company"].as_str())
                .bind(c["location"].as_str())
                .bind(c["email"].as_str())
                .bind(c["linkedin_url"].as_str())
                .bind(c["company_website"].as_str())
                .bind(c["status_id"].as_str())
                .bind(c["intelligence_summary"].as_str().or(c["summary"].as_str()))
                .bind(c["last_contacted_date"].as_str())
                .bind(c["next_contact_date"].as_str())
                .bind(existing_id.as_deref().unwrap_or(&id))
                .execute(&mut *tx)
                .await?;
                contacts_updated += 1;
            } else {
                // INSERT new contact preserving id
                let created_at = c["created_at"]
                    .as_str()
                    .unwrap_or("")
                    .to_string();
                let updated_at = c["updated_at"]
                    .as_str()
                    .unwrap_or("")
                    .to_string();

                sqlx::query(
                    "INSERT INTO contacts (
                        id, first_name, last_name, title, company, location,
                        email, linkedin_url, company_website, status_id,
                        intelligence_summary, last_contacted_date, next_contact_date,
                        cadence_stage, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                )
                .bind(&id)
                .bind(&first_name)
                .bind(&last_name)
                .bind(c["title"].as_str())
                .bind(c["company"].as_str())
                .bind(c["location"].as_str())
                .bind(c["email"].as_str())
                .bind(c["linkedin_url"].as_str())
                .bind(c["company_website"].as_str())
                .bind(c["status_id"].as_str())
                .bind(c["intelligence_summary"].as_str().or(c["summary"].as_str()))
                .bind(c["last_contacted_date"].as_str())
                .bind(c["next_contact_date"].as_str())
                .bind(c["cadence_stage"].as_i64().map(|n| n as i32))
                .bind(if created_at.is_empty() { chrono::Utc::now().to_rfc3339() } else { created_at })
                .bind(if updated_at.is_empty() { chrono::Utc::now().to_rfc3339() } else { updated_at })
                .execute(&mut *tx)
                .await?;
                contacts_added += 1;
            }
        }
    }

    // --- Contact-tag assignments (v1.1 only) ---
    if version == "1.1" {
        if let Some(ct_rows) = json["contact_tags"].as_array() {
            for row in ct_rows {
                let contact_id = row["contact_id"].as_str().unwrap_or("").to_string();
                let tag_id = row["tag_id"].as_str().unwrap_or("").to_string();
                if contact_id.is_empty() || tag_id.is_empty() {
                    continue;
                }
                sqlx::query(
                    "INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)",
                )
                .bind(&contact_id)
                .bind(&tag_id)
                .execute(&mut *tx)
                .await?;
            }
        }
    }

    // --- Settings ---
    if let Some(settings) = json["settings"].as_object() {
        for (key, value) in settings {
            if let Some(v) = value.as_str() {
                sqlx::query("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)")
                    .bind(key)
                    .bind(v)
                    .execute(&mut *tx)
                    .await?;
            }
        }
    }

    tx.commit().await?;

    Ok(ImportSummary {
        contacts_added,
        contacts_updated,
        statuses_added,
        tags_added,
    })
}

#[tauri::command]
async fn save_setting(
    db: tauri::State<'_, Db>,
    key: String,
    value: String,
) -> Result<(), AppError> {
    // Intercept sensitive keys and store them in OS keychain
    if key == "outlook_client_id" {
        jobdex_core::crypto::store_secret("outlook_client_id", &value)
            .map_err(|e| AppError::Internal(e.to_string()))?;
        return Ok(());
    }

    let manager = jobdex_core::settings::SettingsManager::new(db.pool().clone());
    manager
        .set(&key, &value)
        .await
        .map_err(|e| e.to_string().into())
}

// ===== Import Commands =====

#[tauri::command]
fn get_import_headers(file_path: String) -> Result<jobdex_core::import::ImportPreview, AppError> {
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
    jobdex_core::import::preview_file(&file_path).map_err(|e| e.to_string().into())
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
    mapping: jobdex_core::import::ColumnMapping,
) -> Result<ImportAnalysis, AppError> {
    let contacts = jobdex_core::import::parse_file_with_mapping(&file_path, &mapping)?;

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

#[derive(serde::Serialize)]
struct ImportResult {
    imported: usize,
    skipped: usize,
    merged: usize,
    failed: usize,
    errors: Vec<String>,
}

#[tauri::command]
async fn import_contacts(
    db: tauri::State<'_, Db>,
    file_path: String,
    mapping: jobdex_core::import::ColumnMapping,
    mode: String, // "skip", "merge", "none"
) -> Result<ImportResult, AppError> {
    let contacts = jobdex_core::import::parse_file_with_mapping(&file_path, &mapping)?;

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

    let mut imported = 0;
    let mut skipped = 0;
    let mut merged = 0;
    let mut failed = 0;
    let mut errors: Vec<String> = Vec::new();

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
                let result = sqlx::query(
                    r#"
                    UPDATE contacts SET
                        email = COALESCE(email, NULLIF(?, '')),
                        linkedin_url = COALESCE(linkedin_url, NULLIF(?, '')),
                        company = COALESCE(company, NULLIF(?, '')),
                        title = COALESCE(title, NULLIF(?, '')),
                        location = COALESCE(location, NULLIF(?, '')),
                        company_website = COALESCE(company_website, NULLIF(?, ''))
                    WHERE id = ?
                    "#,
                )
                .bind(&contact.email)
                .bind(&contact.linkedin_url)
                .bind(&contact.company)
                .bind(&contact.title)
                .bind(&contact.location)
                .bind(&contact.company_website)
                .bind(&id)
                .execute(pool)
                .await;

                if result.is_ok() {
                    merged += 1;
                } else {
                    failed += 1;
                    errors.push(format!("Failed to merge contact: {} {}", contact.first_name, contact.last_name));
                }
            } else {
                skipped += 1;
            }
        } else {
            // Insert New - use position-based default status (top of the list)
            let id = uuid::Uuid::new_v4().to_string();
            let default_status: Option<(String, String)> = sqlx::query_as(
                "SELECT id, label FROM statuses ORDER BY position ASC LIMIT 1",
            )
            .fetch_optional(pool)
            .await
            .map_err(|e: sqlx::Error| e.to_string())?;

            let (status_label, status_id) = match default_status {
                Some((id, label)) => (label, id),
                None => ("Imported".to_string(), String::new()),
            };

            let result = sqlx::query(
                "INSERT INTO contacts (id, first_name, last_name, email, linkedin_url, company, title, location, company_website, status, status_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
            )
                .bind(&id)
                .bind(&contact.first_name)
                .bind(&contact.last_name)
                .bind(&contact.email)
                .bind(&contact.linkedin_url)
                .bind(&contact.company)
                .bind(&contact.title)
                .bind(&contact.location)
                .bind(&contact.company_website)
                .bind(&status_label)
                .bind(&status_id)
                .execute(pool)
                .await;

            if result.is_ok() {
                imported += 1;
            } else {
                failed += 1;
                errors.push(format!("Failed to import contact: {} {}", contact.first_name, contact.last_name));
            }
        }
    }

    Ok(ImportResult { imported, skipped, merged, failed, errors })
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

    // Fetch the label for the given status_id to keep legacy 'status' column in sync
    let status_label: Option<String> = sqlx::query_scalar("SELECT label FROM statuses WHERE id = ?")
        .bind(&status_id)
        .fetch_optional(&mut *tx)
        .await?;

    let mut affected_count = 0;

    for id in ids {
        let result = sqlx::query("UPDATE contacts SET status_id = ?, status = COALESCE(?, status) WHERE id = ?")
            .bind(&status_id)
            .bind(&status_label)
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
async fn get_tags(db: tauri::State<'_, Db>) -> Result<Vec<jobdex_core::models::Tag>, AppError> {
    let pool = db.pool();
    let tags = sqlx::query_as::<sqlx::Sqlite, jobdex_core::models::Tag>(
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

#[derive(serde::Serialize)]
struct EmailTemplateResponse {
    id: String,
    name: String,
    subject: Option<String>,
    body: Option<String>,
    attachment_paths: Vec<String>,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

#[tauri::command]
async fn get_email_templates(
    db: tauri::State<'_, Db>,
) -> Result<Vec<EmailTemplateResponse>, AppError> {
    let pool = db.pool();
    let templates = sqlx::query_as::<sqlx::Sqlite, jobdex_core::models::EmailTemplate>(
        "SELECT id, name, subject, body, attachment_paths, created_at, updated_at FROM email_templates ORDER BY name ASC",
    )
    .fetch_all(pool)
    .await?;
    let response = templates
        .into_iter()
        .map(|t| {
            let paths: Vec<String> = serde_json::from_str(&t.attachment_paths).unwrap_or_default();
            EmailTemplateResponse {
                id: t.id,
                name: t.name,
                subject: t.subject,
                body: t.body,
                attachment_paths: paths,
                created_at: t.created_at,
                updated_at: t.updated_at,
            }
        })
        .collect();
    Ok(response)
}

#[tauri::command]
async fn upsert_email_template(
    db: tauri::State<'_, Db>,
    id: Option<String>,
    name: String,
    subject: Option<String>,
    body: Option<String>,
    attachment_paths: Option<Vec<String>>,
) -> Result<String, AppError> {
    let pool = db.pool();
    let template_id = id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let paths_json = serde_json::to_string(&attachment_paths.unwrap_or_default())
        .map_err(|e| AppError::Serialization(e))?;

    sqlx::query(
        r#"
        INSERT INTO email_templates (id, name, subject, body, attachment_paths, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            subject = excluded.subject,
            body = excluded.body,
            attachment_paths = excluded.attachment_paths,
            updated_at = CURRENT_TIMESTAMP
        "#,
    )
    .bind(&template_id)
    .bind(name)
    .bind(subject)
    .bind(body)
    .bind(paths_json)
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
        gmail_configured: jobdex_core::crypto::has_credentials("gmail"),
        outlook_configured: jobdex_core::crypto::has_credentials("outlook"),
    })
}

#[tauri::command]
async fn save_email_credentials(
    provider: String,
    client_id: String,
    client_secret: String,
) -> Result<(), AppError> {
    jobdex_core::crypto::store_credential(&provider, "client_id", &client_id)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    jobdex_core::crypto::store_credential(&provider, "client_secret", &client_secret)
        .map_err(|e| AppError::Internal(e.to_string()))?;
    Ok(())
}

// ===== App Lock Screen Commands =====

#[tauri::command]
async fn set_lock_pin(db: tauri::State<'_, Db>, pin: String) -> Result<(), AppError> {
    use jobdex_core::settings::SettingsManager;

    let manager = SettingsManager::new(db.pool().clone());
    let stored = jobdex_core::crypto::create_pin_data(&pin);

    manager
        .set("app_lock_pin_hash", &stored)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    Ok(())
}

#[tauri::command]
async fn verify_lock_pin(db: tauri::State<'_, Db>, pin: String) -> Result<bool, AppError> {
    use jobdex_core::settings::SettingsManager;

    let manager = SettingsManager::new(db.pool().clone());
    let stored = manager
        .get("app_lock_pin_hash")
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

    match stored {
        Some(hash) => Ok(jobdex_core::crypto::verify_pin_against_hash(&pin, &hash)),
        None => Err(AppError::Internal("No PIN configured".to_string())),
    }
}

#[tauri::command]
async fn has_lock_pin(db: tauri::State<'_, Db>) -> Result<bool, AppError> {
    use jobdex_core::settings::SettingsManager;

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
) -> Result<Vec<jobdex_core::models::ContactEvent>, AppError> {
    let pool = db.pool();
    // Only return user-created events (meetings, calls, etc.) — NOT system activity
    let events = sqlx::query_as::<_, jobdex_core::models::ContactEvent>(
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
) -> Result<Vec<jobdex_core::models::ContactEvent>, AppError> {
    let pool = db.pool();
    // Only return system-generated activity events for the Activity tab
    let events = sqlx::query_as::<_, jobdex_core::models::ContactEvent>(
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

use std::sync::Mutex;

static UPDATE_CACHE: Mutex<Option<(String, std::time::Instant)>> = Mutex::new(None);
const UPDATE_CACHE_TTL: std::time::Duration = std::time::Duration::from_secs(3600); // 1 hour

#[tauri::command]
async fn check_for_update() -> Result<String, AppError> {
    // Return cached result if still valid
    {
        let cache = UPDATE_CACHE.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        if let Some((cached_tag, timestamp)) = cache.as_ref() {
            if timestamp.elapsed() < UPDATE_CACHE_TTL {
                #[cfg(debug_assertions)]
                println!("[update] returning cached result: {:?}", cached_tag);
                return Ok(cached_tag.clone());
            }
        }
    }

    #[cfg(debug_assertions)]
    println!("[update] checking GitHub for latest release...");

    let client = reqwest::Client::builder()
        .user_agent("JobDex")
        .build()
        .map_err(|e| AppError::Network(e.to_string()))?;

    let res = client
        .get("https://api.github.com/repos/Gitter09/jobdex/releases/latest")
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

    // Cache the result
    {
        let mut cache = UPDATE_CACHE.lock().map_err(|e| AppError::Internal(e.to_string()))?;
        *cache = Some((tag.clone(), std::time::Instant::now()));
    }

    Ok(tag)
}
