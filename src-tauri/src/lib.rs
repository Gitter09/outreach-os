use outreach_core::Db;
use tauri::Manager;
// use std::fs; removed

/// Extracts first and last name from page title or LinkedIn URL slug
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
async fn get_contacts(db: tauri::State<'_, Db>) -> Result<Vec<ContactWithTags>, String> {
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
) -> Result<Vec<outreach_core::models::Status>, String> {
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
) -> Result<String, String> {
    let pool = db.pool();
    let id = uuid::Uuid::new_v4().to_string();
    // automated position at end
    sqlx::query("INSERT INTO statuses (id, label, color, position) VALUES (?, ?, ?, (SELECT COUNT(*) FROM statuses))")
        .bind(&id)
        .bind(label)
        .bind(color)
        .execute(pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(id)
}

#[tauri::command]
async fn update_status(
    db: tauri::State<'_, Db>,
    id: String,
    label: String,
    color: String,
) -> Result<(), String> {
    let pool = db.pool();
    sqlx::query(
        "UPDATE statuses SET label = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(label)
    .bind(color)
    .bind(id)
    .execute(pool)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn delete_status(db: tauri::State<'_, Db>, id: String) -> Result<(), String> {
    let pool = db.pool();
    // fallback contacts to default? or set null?
    // SQLite FK might restrict. For now, let's just delete and let contacts contain orphaned status_id (bad practice) or set null.
    // Better: set status_id to null for contacts using this status.
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("UPDATE contacts SET status_id = NULL WHERE status_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM statuses WHERE id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn add_contact(
    db: tauri::State<'_, Db>,
    first_name: String,
    last_name: String,
    email: Option<String>,
    linkedin_url: Option<String>,
    status_id: Option<String>,
    title: Option<String>,
    company: Option<String>,
    location: Option<String>,
    company_website: Option<String>,
) -> Result<String, String> {
    let pool = db.pool();
    let id = uuid::Uuid::new_v4().to_string();

    // Determine status_id and label
    let (final_status_id, final_status_label) = if let Some(sid) = status_id {
        // optionally fetch label to be safe, or just trust the ID and let label be null/outdated until join?
        // Let's just default label to empty for now or fetch it if we want perfection.
        // For simplicity: We will use the provided status_id. We won't fetch the label here to save a query
        // because the 'status' column is legacy anyway.
        (sid, "Custom")
    } else {
        ("def-stat-001".to_string(), "New")
    };

    sqlx::query("INSERT INTO contacts (id, first_name, last_name, email, linkedin_url, status, status_id, title, company, location, company_website) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(first_name)
        .bind(last_name)
        .bind(email)
        .bind(linkedin_url)
        .bind(final_status_label) // Legacy status field
        .bind(final_status_id)
        .bind(title)
        .bind(company)
        .bind(location)
        .bind(company_website)
        .execute(pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(id)
}

#[tauri::command]
async fn update_contact(
    db: tauri::State<'_, Db>,
    id: String,
    first_name: Option<String>,
    last_name: Option<String>,
    email: Option<String>,
    linkedin_url: Option<String>,
    status: Option<String>, // Legacy
    status_id: Option<String>,
    last_contacted_date: Option<chrono::DateTime<chrono::Utc>>,
    next_contact_date: Option<chrono::DateTime<chrono::Utc>>,
    cadence_stage: Option<i32>,
    title: Option<String>,
    company: Option<String>,
    location: Option<String>,
    company_website: Option<String>,
) -> Result<(), String> {
    let pool = db.pool();

    let result = sqlx::query(
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
            updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
        "#,
    )
    .bind(first_name)
    .bind(last_name)
    .bind(email)
    .bind(linkedin_url)
    .bind(status)
    .bind(status_id)
    .bind(last_contacted_date)
    .bind(next_contact_date)
    .bind(cadence_stage)
    .bind(title)
    .bind(company)
    .bind(location)
    .bind(company_website)
    .bind(id)
    .execute(pool)
    .await;

    result.map_err(|e: sqlx::Error| e.to_string())?;
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
            scrape_clipboard,
            magic_paste,
            enrich_contact_cmd,
            get_email_accounts,
            gmail_connect,
            outlook_connect,
            email_send,
            delete_email_account,
            email_schedule,
            get_emails_for_contact,
            draft_email_ai,
            generate_subject_lines_ai,
            save_api_key,
            get_settings,
            save_setting,
            export_all_data,
            clear_all_data,
            import_contacts,
            analyze_import,
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
            draft_email_ai,
            generate_subject_lines_ai,
            save_api_key,
            get_settings,
            save_setting,
            export_all_data,
            clear_all_data,
            sync_email_accounts,
            sync_email_account,
            reset_email_sync_state,
            poll_email_tracking,
            get_email_tracking
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
async fn fix_orphan_contacts(db: tauri::State<'_, Db>) -> Result<String, String> {
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

// Re-implement scrape_clipboard to use the same Configurable AI Engine as magic_paste
#[tauri::command]
async fn scrape_clipboard(db: tauri::State<'_, Db>) -> Result<String, String> {
    // 1. Get Settings & AI Config
    let settings = outreach_core::settings::SettingsManager::new(db.pool().clone());
    let provider_str = settings
        .get("ai_provider")
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "gemini".to_string());
    let model = settings
        .get("ai_model")
        .await
        .map_err(|e| e.to_string())?
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "google/gemini-2.0-flash-exp:free".to_string());
    let base_url = settings
        .get("ai_base_url")
        .await
        .map_err(|e| e.to_string())?
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "https://openrouter.ai/api/v1".to_string());

    let mut config = outreach_core::ai::AiConfig::default();
    if provider_str == "ollama" {
        config.provider = outreach_core::ai::AiProvider::Ollama;
        config.ollama_model = model;
        config.ollama_base_url = base_url;
    } else {
        config.provider = outreach_core::ai::AiProvider::OpenRouter;
        config.openrouter_model = model;
        config.openrouter_base_url = base_url;
        let service = if provider_str == "gemini" {
            "GEMINI_API_KEY"
        } else {
            "OPENROUTER_API_KEY"
        };
        // Retrieve key from SettingsManager
        config.openrouter_api_key = settings
            .get(service)
            .await
            .map_err(|e| e.to_string())?
            .or(None);
    }

    // 2. Access Clipboard
    let engine = outreach_core::EnrichmentEngine::new();
    let url = engine.get_clipboard_url().map_err(|e| e.to_string())?;

    // 3. Fetch Page Data
    let (title, raw_html, _description) = engine
        .fetch_page_metadata(&url)
        .await
        .map_err(|e| e.to_string())?;

    // 4. Build Prompt
    // If it's a social profile, we prioritize the URL slug for the name
    let is_social =
        url.contains("linkedin.com") || url.contains("twitter.com") || url.contains("x.com");
    let content_to_send = if is_social {
        "Social profile detected. Prioritize the name from the URL if not in title.".to_string()
    } else {
        raw_html.chars().take(1000).collect::<String>()
    };

    let prompt = format!(
        r#"Extract contact details from this page into JSON.
If the name is not clearly in the text/title, infer it from the URL slug (e.g. john-doe -> John Doe).

URL: {}
Title: {}
Snippet: {}

JSON Format:
{{
  "first_name": "string",
  "last_name": "string", 
  "title": "string or null",
  "company": "string or null",
  "location": "string or null",
  "email": "string or null",
  "linkedin_url": "string or null",
  "context": "1 sentence brief"
}}

Respond with ONLY the JSON object."#,
        url, title, content_to_send
    );

    // 5. Call AI
    println!("--- [Clipboard Intelligence] Debug Start ---");
    println!("Provider: {}", provider_str);
    println!(
        "Base URL: {}",
        if provider_str == "ollama" {
            &config.ollama_base_url
        } else {
            &config.openrouter_base_url
        }
    );

    let ai_client = outreach_core::AiClient::new(config);
    let response = ai_client.generate(&prompt).await.map_err(|e| {
        println!("--- [Clipboard Intelligence] Error: {} ---", e);
        e.to_string()
    })?;

    println!("Raw AI Response: {}", response);
    println!("--- [Clipboard Intelligence] Debug End ---");

    // 6. Parse & Save
    let parsed: serde_json::Value = serde_json::from_str(&response)
        .or_else(|_| {
            let json_start = response.find('{').unwrap_or(0);
            let json_end = response.rfind('}').map(|i| i + 1).unwrap_or(response.len());
            serde_json::from_str(&response[json_start..json_end])
        })
        .map_err(|e| format!("Failed to parse AI response: {}", e))?;

    // If AI failed to extract names, fallback to Title parsing (but using the simplified logic we have, or just "Unknown")
    let first_name = parsed["first_name"]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or("Unknown")
        .to_string();
    let last_name = parsed["last_name"]
        .as_str()
        .filter(|s| !s.is_empty())
        .unwrap_or("Contact")
        .to_string();
    let hooks = parsed["context"].as_str().unwrap_or("").to_string();

    let pool = db.pool();
    let id = uuid::Uuid::new_v4().to_string();

    sqlx::query("INSERT INTO contacts (id, first_name, last_name, linkedin_url, intelligence_summary, title, company, location, company_website, email, status, status_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&first_name)
        .bind(&last_name)
        .bind(&url)
        .bind(&hooks)
        .bind(parsed["title"].as_str())
        .bind(parsed["company"].as_str())
        .bind(parsed["location"].as_str())
        .bind(parsed["company_website"].as_str())
        .bind(parsed["email"].as_str())
        .bind("Enriched")
        .bind("stat-new")
        .execute(pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(id)
}

/// Parsed contact data from clipboard
#[derive(serde::Serialize)]
struct ParsedContact {
    first_name: String,
    last_name: String,
    title: Option<String>,
    company: Option<String>,
    location: Option<String>,
    company_website: Option<String>,
    email: Option<String>,
    linkedin_url: Option<String>,
    context: Option<String>,
}

/// AI-powered Magic Paste: parses any clipboard text into contact fields
#[tauri::command]
async fn magic_paste(db: tauri::State<'_, Db>) -> Result<ParsedContact, String> {
    use arboard::Clipboard;

    // 1. Get clipboard text
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    let text = clipboard.get_text().map_err(|e| e.to_string())?;

    if text.trim().is_empty() {
        return Err("Clipboard is empty".to_string());
    }

    // 2. Load AI Settings
    let settings = outreach_core::settings::SettingsManager::new(db.pool().clone());
    let provider_str = settings
        .get("ai_provider")
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "gemini".to_string());
    let model = settings
        .get("ai_model")
        .await
        .map_err(|e| e.to_string())?
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "google/gemini-2.0-flash-exp:free".to_string());
    let base_url = settings
        .get("ai_base_url")
        .await
        .map_err(|e| e.to_string())?
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "https://openrouter.ai/api/v1".to_string());

    let mut config = outreach_core::ai::AiConfig::default();

    // NOTE: Magic Paste uses a specific hardcoded prompt structure inside the function below,
    // but we respect the provider/model from settings.

    if provider_str == "ollama" {
        config.provider = outreach_core::ai::AiProvider::Ollama;
        config.ollama_model = model;
        // Fix: Use the configured base URL instead of hardcoded localhost
        config.ollama_base_url = base_url;
    } else {
        config.provider = outreach_core::ai::AiProvider::OpenRouter;
        config.openrouter_model = model;
        config.openrouter_base_url = base_url;

        let service = if provider_str == "gemini" {
            "GEMINI_API_KEY"
        } else {
            "OPENROUTER_API_KEY"
        };
        // Retrieve key from SettingsManager
        config.openrouter_api_key = settings
            .get(service)
            .await
            .map_err(|e| e.to_string())?
            .or(None);
    }

    // Debug logging for user verification
    println!("--- [Magic Paste] Debug Start ---");
    println!("Provider: {}", provider_str);
    println!("Model: {}", config.ollama_model);
    println!(
        "Base URL: {}",
        if provider_str == "ollama" {
            &config.ollama_base_url
        } else {
            &config.openrouter_base_url
        }
    );

    // 3. Build AI prompt for structured extraction
    let prompt = format!(
        r#"Analyze this text/URL and extract contact info into JSON.
CRITICAL: If it's a LinkedIn URL (like /in/john-doe), extract the Name from the link path if not in the text.

Input:
{}

JSON Template:
{{
  "first_name": "string",
  "last_name": "string",
  "title": "string or null",
  "company": "string or null",
  "location": "string or null",
  "email": "string or null",
  "linkedin_url": "string or null",
  "context": "Short summary"
}}

Return JSON only."#,
        text.chars().take(2000).collect::<String>()
    );

    println!("Input Text (First 100 chars): {:.100}", text);

    // 4. Call AI Client
    let ai_client = outreach_core::AiClient::new(config);
    let start_time = std::time::Instant::now();
    let response = ai_client.generate(&prompt).await.map_err(|e| {
        println!("--- [Magic Paste] Error: {} ---", e);
        e.to_string()
    })?;

    println!("Response Time: {:?}", start_time.elapsed());
    println!("Raw AI Response: {}", response);
    println!("--- [Magic Paste] Debug End ---");

    // 5. Parse JSON response
    let parsed: serde_json::Value = serde_json::from_str(&response)
        .or_else(|_| {
            // Try to extract JSON from markdown code blocks
            let json_start = response.find('{').unwrap_or(0);
            let json_end = response.rfind('}').map(|i| i + 1).unwrap_or(response.len());
            serde_json::from_str(&response[json_start..json_end])
        })
        .map_err(|e| format!("Failed to parse AI response: {}. Raw: {}", e, response))?;

    Ok(ParsedContact {
        first_name: parsed["first_name"].as_str().unwrap_or("").to_string(),
        last_name: parsed["last_name"].as_str().unwrap_or("").to_string(),
        title: parsed["title"].as_str().map(|s| s.to_string()),
        company: parsed["company"].as_str().map(|s| s.to_string()),
        location: parsed["location"].as_str().map(|s| s.to_string()),
        company_website: parsed["company_website"].as_str().map(|s| s.to_string()),
        email: parsed["email"].as_str().map(|s| s.to_string()),
        linkedin_url: parsed["linkedin_url"].as_str().map(|s| s.to_string()),
        context: parsed["context"].as_str().map(|s| s.to_string()),
    })
}

// ===== Gmail Commands =====

#[tauri::command]
async fn enrich_contact_cmd(
    db: tauri::State<'_, Db>,
    id: String,
    url: String,
) -> Result<String, String> {
    // 1. Get Settings & AI Config
    let settings = outreach_core::settings::SettingsManager::new(db.pool().clone());
    let provider_str = settings
        .get("ai_provider")
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "gemini".to_string());
    let model = settings
        .get("ai_model")
        .await
        .map_err(|e| e.to_string())?
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "google/gemini-2.0-flash-exp:free".to_string());
    let base_url = settings
        .get("ai_base_url")
        .await
        .map_err(|e| e.to_string())?
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "https://openrouter.ai/api/v1".to_string());

    println!("--- [Enrichment Debug] Start ---");
    println!("Contact ID: {}", id);
    println!("URL: {}", url);
    println!("Provider: {}", provider_str);
    println!("Model: {}", model);
    println!("Base URL: {}", base_url);

    let mut config = outreach_core::ai::AiConfig::default();
    if provider_str == "ollama" {
        config.provider = outreach_core::ai::AiProvider::Ollama;
        config.ollama_model = model;
        config.ollama_base_url = base_url;
    } else {
        config.provider = outreach_core::ai::AiProvider::OpenRouter;
        config.openrouter_model = model;
        config.openrouter_base_url = base_url;
        let service = if provider_str == "gemini" {
            "GEMINI_API_KEY"
        } else {
            "OPENROUTER_API_KEY"
        };
        // Retrieve key from SettingsManager
        config.openrouter_api_key = settings
            .get(service)
            .await
            .map_err(|e| e.to_string())?
            .or(None);
    }

    println!("Has API Key: {}", config.openrouter_api_key.is_some());

    let engine = outreach_core::EnrichmentEngine::new();
    let (_, raw_html, _) = engine
        .fetch_page_metadata(&url)
        .await
        .map_err(|e| e.to_string())?;

    println!("Fetched HTML Length: {}", raw_html.len());

    let hooks = engine.try_generate_hooks(&raw_html, Some(config)).await;

    println!("Generated Hooks Length: {}", hooks.len());
    println!(
        "Hooks Snippet: {}",
        hooks.chars().take(100).collect::<String>()
    );
    println!("--- [Enrichment Debug] End ---");

    // Update DB
    sqlx::query("UPDATE contacts SET intelligence_summary = ? WHERE id = ?")
        .bind(&hooks)
        .bind(&id)
        .execute(db.pool())
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;

    Ok(hooks)
}

#[tauri::command]
async fn get_email_accounts(
    db: tauri::State<'_, Db>,
) -> Result<Vec<outreach_core::models::EmailAccount>, String> {
    let service = outreach_core::EmailService::new(db.inner().clone());
    service.list_accounts().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn gmail_connect(db: tauri::State<'_, Db>) -> Result<String, String> {
    use std::thread;

    let client = outreach_core::gmail::GmailClient::new();

    // Get auth URL and PKCE verifier
    let (auth_url, pkce_verifier) = client.get_auth_url().map_err(|e| e.to_string())?;

    // Open browser
    open::that(&auth_url).map_err(|e| format!("Failed to open browser: {}", e))?;

    // Wait for callback
    let code = thread::spawn(move || client.wait_for_callback())
        .join()
        .map_err(|_| "OAuth callback thread panicked".to_string())?
        .map_err(|e| e.to_string())?;

    // Exchange code
    let client = outreach_core::gmail::GmailClient::new();
    let tokens = client
        .exchange_code(code, pkce_verifier)
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
async fn outlook_connect(db: tauri::State<'_, Db>) -> Result<String, String> {
    use std::thread;

    let client = outreach_core::outlook::OutlookClient::new();

    let (auth_url, pkce_verifier) = client.get_auth_url().map_err(|e| e.to_string())?;

    open::that(&auth_url).map_err(|e| format!("Failed to open browser: {}", e))?;

    let code = thread::spawn(move || client.wait_for_callback())
        .join()
        .map_err(|_| "OAuth callback thread panicked".to_string())?
        .map_err(|e| e.to_string())?;

    let client = outreach_core::outlook::OutlookClient::new();
    let tokens = client
        .exchange_code(code, pkce_verifier)
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
) -> Result<String, String> {
    let service = outreach_core::EmailService::new(db.inner().clone());
    service
        .send_email(&account_id, &to, &subject, &body)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn email_schedule(
    db: tauri::State<'_, Db>,
    account_id: String,
    contact_id: String,
    subject: String,
    body: String,
    scheduled_at: i64,
) -> Result<String, String> {
    let service = outreach_core::EmailService::new(db.inner().clone());
    service
        .schedule_email(&account_id, &contact_id, &subject, &body, scheduled_at)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_emails_for_contact(
    db: tauri::State<'_, Db>,
    contact_id: String,
) -> Result<Vec<outreach_core::models::EmailMessage>, String> {
    // We need to resolve contact_id to email first to be accurate, but service handles it?
    // Service query above was a bit hacky. Let's fix it here or there.
    // Actually, in service I used subquery on contact_id. That works if contact has email.

    let service = outreach_core::EmailService::new(db.inner().clone());
    service
        .get_emails_for_contact(&contact_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_email_account(db: tauri::State<'_, Db>, account_id: String) -> Result<(), String> {
    let service = outreach_core::EmailService::new(db.inner().clone());
    service
        .delete_account(&account_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn sync_email_accounts(
    db: tauri::State<'_, Db>,
) -> Result<Vec<outreach_core::SyncResult>, String> {
    let service = outreach_core::EmailService::new(db.inner().clone());
    service.sync_all_accounts().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn sync_email_account(
    db: tauri::State<'_, Db>,
    account_id: String,
) -> Result<outreach_core::SyncResult, String> {
    let service = outreach_core::EmailService::new(db.inner().clone());
    service
        .sync_account(&account_id)
        .await
        .map_err(|e| e.to_string())
}

/// Reset last_synced_at to NULL for one or all accounts,
/// forcing the next sync to re-fetch all messages from the provider.
/// This is needed to backfill messages that were previously stored with empty bodies.
#[tauri::command]
async fn reset_email_sync_state(
    db: tauri::State<'_, Db>,
    account_id: Option<String>,
) -> Result<(), String> {
    let pool = db.pool();
    match account_id {
        Some(id) => {
            sqlx::query("UPDATE email_accounts SET last_synced_at = NULL WHERE id = ?")
                .bind(&id)
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
        }
        None => {
            sqlx::query("UPDATE email_accounts SET last_synced_at = NULL")
                .execute(pool)
                .await
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
async fn poll_email_tracking(db: tauri::State<'_, Db>) -> Result<usize, String> {
    outreach_core::tracking::poll_tracking_events(db.inner())
        .await
        .map_err(|e| e.to_string())
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
) -> Result<Vec<TrackingEventResponse>, String> {
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
async fn draft_email_ai(db: tauri::State<'_, Db>, contact_id: String) -> Result<String, String> {
    let pool = db.pool();
    let contact = sqlx::query_as::<sqlx::Sqlite, outreach_core::models::Contact>(
        "SELECT * FROM contacts WHERE id = ?",
    )
    .bind(&contact_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Contact not found")?;

    // Get settings
    let settings = outreach_core::settings::SettingsManager::new(db.pool().clone());
    let provider_str = settings
        .get("ai_provider")
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "gemini".to_string());
    let model = settings
        .get("ai_model")
        .await
        .map_err(|e| e.to_string())?
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "google/gemini-2.0-flash-exp:free".to_string());
    let base_url = settings
        .get("ai_base_url")
        .await
        .map_err(|e| e.to_string())?
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "https://openrouter.ai/api/v1".to_string());
    let custom_draft = settings
        .get("prompt_email_draft")
        .await
        .map_err(|e| e.to_string())?;
    let custom_subject = settings
        .get("prompt_subject_line")
        .await
        .map_err(|e| e.to_string())?;

    // Determine config
    let mut config = outreach_core::ai::AiConfig::default();
    config.custom_draft_prompt = custom_draft;
    config.custom_subject_prompt = custom_subject;

    if provider_str == "ollama" {
        config.provider = outreach_core::ai::AiProvider::Ollama;
        config.ollama_model = model; // Reuse model field for ollama model name
    } else {
        // OpenRouter or Gemini
        config.provider = outreach_core::ai::AiProvider::OpenRouter;
        config.openrouter_model = model;
        config.openrouter_base_url = base_url;

        // Get API key
        let service = if provider_str == "gemini" {
            "GEMINI_API_KEY"
        } else {
            "OPENROUTER_API_KEY"
        };
        // Retrieve key from SettingsManager
        config.openrouter_api_key = settings
            .get(service)
            .await
            .map_err(|e| e.to_string())?
            .or(None);
    }

    // Generate draft
    let email_ai = outreach_core::EmailAI::new(config);
    email_ai
        .draft_email(&contact)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn generate_subject_lines_ai(
    db: tauri::State<'_, Db>,
    contact_id: String,
) -> Result<Vec<String>, String> {
    let pool = db.pool();
    let contact = sqlx::query_as::<sqlx::Sqlite, outreach_core::models::Contact>(
        "SELECT * FROM contacts WHERE id = ?",
    )
    .bind(&contact_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?
    .ok_or("Contact not found")?;

    // Get settings
    let settings = outreach_core::settings::SettingsManager::new(db.pool().clone());
    let provider_str = settings
        .get("ai_provider")
        .await
        .map_err(|e| e.to_string())?
        .unwrap_or_else(|| "gemini".to_string());
    let model = settings
        .get("ai_model")
        .await
        .map_err(|e| e.to_string())?
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "google/gemini-2.0-flash-exp:free".to_string());
    let base_url = settings
        .get("ai_base_url")
        .await
        .map_err(|e| e.to_string())?
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "https://openrouter.ai/api/v1".to_string());
    let custom_draft = settings
        .get("prompt_email_draft")
        .await
        .map_err(|e| e.to_string())?;
    let custom_subject = settings
        .get("prompt_subject_line")
        .await
        .map_err(|e| e.to_string())?;

    let mut config = outreach_core::ai::AiConfig::default();
    config.custom_draft_prompt = custom_draft;
    config.custom_subject_prompt = custom_subject;

    if provider_str == "ollama" {
        config.provider = outreach_core::ai::AiProvider::Ollama;
        config.ollama_model = model;
    } else {
        config.provider = outreach_core::ai::AiProvider::OpenRouter;
        config.openrouter_model = model;
        config.openrouter_base_url = base_url;
        let service = if provider_str == "gemini" {
            "GEMINI_API_KEY"
        } else {
            "OPENROUTER_API_KEY"
        };
        // Retrieve key from SettingsManager
        config.openrouter_api_key = settings
            .get(service)
            .await
            .map_err(|e| e.to_string())?
            .or(None);
    }

    let email_ai = outreach_core::EmailAI::new(config);
    email_ai
        .generate_subject_lines(&contact)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_api_key(
    db: tauri::State<'_, Db>,
    service: String,
    key: String,
) -> Result<(), String> {
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
) -> Result<std::collections::HashMap<String, String>, String> {
    let manager = outreach_core::settings::SettingsManager::new(db.pool().clone());
    manager.get_all().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn clear_all_data(db: tauri::State<'_, Db>) -> Result<(), String> {
    let pool = db.pool();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    sqlx::query("DELETE FROM contacts")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM statuses")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM tags")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;
    sqlx::query("DELETE FROM contact_tags")
        .execute(&mut *tx)
        .await
        .map_err(|e| e.to_string())?;

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn export_all_data(db: tauri::State<'_, Db>) -> Result<String, String> {
    let pool = db.pool();

    let contacts =
        sqlx::query_as::<sqlx::Sqlite, outreach_core::models::Contact>("SELECT * FROM contacts")
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;

    let statuses =
        sqlx::query_as::<sqlx::Sqlite, outreach_core::models::Status>("SELECT * FROM statuses")
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;

    let settings_map = outreach_core::settings::SettingsManager::new(pool.clone())
        .get_all()
        .await
        .map_err(|e| e.to_string())?;

    let export = serde_json::json!({
        "version": "1.0",
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "contacts": contacts,
        "statuses": statuses,
        "settings": settings_map
    });

    serde_json::to_string_pretty(&export).map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_setting(db: tauri::State<'_, Db>, key: String, value: String) -> Result<(), String> {
    let manager = outreach_core::settings::SettingsManager::new(db.pool().clone());
    manager.set(&key, &value).await.map_err(|e| e.to_string())
}

// ===== Import Commands =====

// import_preview function removed as it's never used

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
) -> Result<ImportAnalysis, String> {
    let contacts = outreach_core::import::parse_file_with_mapping(&file_path, &mapping)
        .map_err(|e| e.to_string())?;

    // Fetch existing identifiers for comparison
    let pool = db.pool();
    let existing = sqlx::query_as::<sqlx::Sqlite, ContactIdentity>(
        "SELECT id, email, linkedin_url, first_name, last_name, company FROM contacts",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

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
) -> Result<usize, String> {
    let contacts = outreach_core::import::parse_file_with_mapping(&file_path, &mapping)
        .map_err(|e| e.to_string())?;

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
) -> Result<u64, String> {
    let pool = db.pool();
    let mut tx = pool.begin().await.map_err(|e| e.to_string())?;

    let mut affected_count = 0;
    // We can assume status_id is valid for now, or fetch label if we wanted to sync legacy column
    // For now we just update status_id.

    for id in ids {
        let result = sqlx::query("UPDATE contacts SET status_id = ? WHERE id = ?")
            .bind(&status_id)
            .bind(id)
            .execute(&mut *tx)
            .await
            .map_err(|e| e.to_string())?;
        affected_count += result.rows_affected();
    }

    tx.commit().await.map_err(|e| e.to_string())?;
    Ok(affected_count)
}

// ===== Tag Commands =====

#[tauri::command]
async fn get_tags(db: tauri::State<'_, Db>) -> Result<Vec<outreach_core::models::Tag>, String> {
    let pool = db.pool();
    let tags = sqlx::query_as::<sqlx::Sqlite, outreach_core::models::Tag>(
        "SELECT * FROM tags ORDER BY name ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e: sqlx::Error| e.to_string())?;
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
) -> Result<(), String> {
    let pool = db.pool();
    sqlx::query("INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)")
        .bind(contact_id)
        .bind(tag_id)
        .execute(pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(())
}

#[tauri::command]
async fn unassign_tag(
    db: tauri::State<'_, Db>,
    contact_id: String,
    tag_id: String,
) -> Result<(), String> {
    let pool = db.pool();
    sqlx::query("DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?")
        .bind(contact_id)
        .bind(tag_id)
        .execute(pool)
        .await
        .map_err(|e: sqlx::Error| e.to_string())?;
    Ok(())
}

// ===== Email Credential Commands =====

#[derive(serde::Serialize, serde::Deserialize)]
struct EmailCredentialStatus {
    gmail_configured: bool,
    outlook_configured: bool,
}

#[tauri::command]
async fn check_email_credentials() -> Result<EmailCredentialStatus, String> {
    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let config_dir = home.join(".outreachos");

    let gmail_path = config_dir.join("credentials.json");
    let outlook_path = config_dir.join("ms_credentials.json");

    Ok(EmailCredentialStatus {
        gmail_configured: gmail_path.exists(),
        outlook_configured: outlook_path.exists(),
    })
}

#[tauri::command]
async fn save_email_credentials(
    provider: String,
    client_id: String,
    client_secret: String,
) -> Result<(), String> {
    use std::fs;
    use std::io::Write;

    let home = dirs::home_dir().ok_or("Could not determine home directory")?;
    let config_dir = home.join(".outreachos");

    // Create directory if it doesn't exist
    fs::create_dir_all(&config_dir)
        .map_err(|e| format!("Failed to create config directory: {}", e))?;

    let (file_path, json_content) = match provider.as_str() {
        "gmail" => {
            let path = config_dir.join("credentials.json");
            let content = serde_json::json!({
                "installed": {
                    "client_id": client_id,
                    "client_secret": client_secret
                }
            });
            (path, content)
        }
        "outlook" => {
            let path = config_dir.join("ms_credentials.json");
            let content = serde_json::json!({
                "installed": {
                    "client_id": client_id,
                    "client_secret": client_secret
                }
            });
            (path, content)
        }
        _ => return Err(format!("Unknown provider: {}", provider)),
    };

    let json_str = serde_json::to_string_pretty(&json_content)
        .map_err(|e| format!("Failed to serialize credentials: {}", e))?;

    let mut file = fs::File::create(&file_path)
        .map_err(|e| format!("Failed to create credentials file: {}", e))?;

    file.write_all(json_str.as_bytes())
        .map_err(|e| format!("Failed to write credentials: {}", e))?;

    Ok(())
}
