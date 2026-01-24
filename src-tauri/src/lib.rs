use outreach_core::Db;
use tauri::Manager;
// use std::fs; removed

/// Extracts first and last name from page title or LinkedIn URL slug
fn extract_names_from_title_or_url(title: &str, url: &str) -> (String, String) {
    // Try to extract from title first (works when not blocked)
    let clean_title = title.split('|').next().unwrap_or("").trim();
    if !clean_title.is_empty()
        && !clean_title.contains("LinkedIn")
        && clean_title != "Unknown Profile"
    {
        let names: Vec<&str> = clean_title.split_whitespace().collect();
        if names.len() >= 2 {
            return (names[0].to_string(), names[1..].join(" "));
        }
    }

    // Fallback: Extract from URL slug (e.g., /in/harshit-singh-123)
    if let Some(slug) = extract_linkedin_slug(url) {
        // Remove trailing numbers (LinkedIn adds unique IDs)
        let clean_slug: String = slug
            .split('-')
            .filter(|part| !part.chars().all(|c| c.is_numeric()))
            .collect::<Vec<_>>()
            .join("-");

        let parts: Vec<&str> = clean_slug.split('-').collect();
        if parts.len() >= 2 {
            let first = capitalize(parts[0]);
            let last = parts[1..]
                .iter()
                .map(|s| capitalize(s))
                .collect::<Vec<_>>()
                .join(" ");
            return (first, last);
        } else if parts.len() == 1 {
            return (capitalize(parts[0]), String::new());
        }
    }

    ("Unknown".to_string(), "Contact".to_string())
}

fn extract_linkedin_slug(url: &str) -> Option<&str> {
    // Match /in/username or /pub/username patterns
    url.split("/in/")
        .nth(1)
        .or_else(|| url.split("/pub/").nth(1))
        .map(|s| s.split('/').next().unwrap_or(s))
        .map(|s| s.split('?').next().unwrap_or(s))
}

fn capitalize(s: &str) -> String {
    let mut chars = s.chars();
    match chars.next() {
        None => String::new(),
        Some(first) => first.to_uppercase().chain(chars).collect(),
    }
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
            gmail_status,
            gmail_connect,
            gmail_disconnect,
            send_email,
            import_preview,
            import_contacts,
            delete_contacts_bulk,
            update_contacts_status_bulk,
            get_tags,
            create_tag,
            update_tag,
            delete_tag,
            assign_tag,
            unassign_tag,
            fix_orphan_contacts,
            draft_email_ai,
            generate_subject_lines_ai,
            save_api_key,
            get_settings,
            save_setting,
            export_all_data,
            clear_all_data
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

#[tauri::command]
async fn scrape_clipboard(db: tauri::State<'_, Db>) -> Result<String, String> {
    let engine = outreach_core::EnrichmentEngine::new();

    // 1. Get URL from clipboard
    let url = engine.get_clipboard_url().map_err(|e| e.to_string())?;

    // 2. Fetch page metadata (title, raw HTML, optional description)
    let (title, raw_html, _description) = engine
        .fetch_page_metadata(&url)
        .await
        .map_err(|e| e.to_string())?;

    // 3. Try to generate hooks via Ollama (gracefully falls back if unavailable)
    let hooks = engine.try_generate_hooks(&raw_html, None).await;

    // 4. Extract names - try from title first, fallback to URL slug
    // We need to access the helper function. It's likely private in lib.rs or I need to implement it here?
    // It was used in previous code. I will assume it exists in this file (lines 1-49).
    // If not, I'll need to add it.
    let (first_name, last_name) = extract_names_from_title_or_url(&title, &url);

    // 5. Save to DB
    let pool = db.pool();
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO contacts (id, first_name, last_name, linkedin_url, intelligence_summary, status, status_id) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&first_name)
        .bind(&last_name)
        .bind(&url)
        .bind(&hooks)
        .bind("Enriched")
        .bind("def-stat-001")
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
async fn magic_paste() -> Result<ParsedContact, String> {
    use arboard::Clipboard;

    // 1. Get clipboard text
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    let text = clipboard.get_text().map_err(|e| e.to_string())?;

    if text.trim().is_empty() {
        return Err("Clipboard is empty".to_string());
    }

    // 2. Build AI prompt for structured extraction
    let prompt = format!(
        r#"STRICT INSTRUCTIONS:
Extract contact information from the provided text. 
CRITICAL RULE: do NOT hallucinate. If a field (like email or company) is NOT explicitly present in the text, you MUST return null for that field. Do NOT guess or generate "example" data.

Return ONLY valid, minified JSON.

Fields:
- first_name (required)
- last_name (required)
- title (optional)
- company (optional)
- location (optional, e.g. "San Francisco, CA")
- company_website (optional)
- email (optional)
- linkedin_url (optional)
- context (optional, 1 sentence summary)

EXAMPLE 1:
Input: "John Doe, Principal at Peak XV regarding Series A. linkedin.com/in/jdoe"
Output: {{"first_name": "John", "last_name": "Doe", "title": "Principal", "company": "Peak XV", "location": null, "company_website": null, "email": null, "linkedin_url": "https://linkedin.com/in/jdoe", "context": "Principal at Peak XV regarding Series A"}}

EXAMPLE 2:
Input: "Head of IT at GreenLeaf Inc, San Francisco. www.greenleaf.com"
Output: {{"first_name": "", "last_name": "", "title": "Head of IT", "company": "GreenLeaf Inc.", "location": "San Francisco", "company_website": "www.greenleaf.com", "email": null, "linkedin_url": null, "context": "Head of IT at GreenLeaf Inc"}}

Input Text:
{}

JSON:"#,
        text.chars().take(2000).collect::<String>()
    );

    // 3. Call Ollama (local-first for privacy)
    let ai_client = outreach_core::AiClient::ollama_default();
    let response = ai_client
        .generate(&prompt)
        .await
        .map_err(|e| e.to_string())?;

    // 4. Parse JSON response
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
    let engine = outreach_core::EnrichmentEngine::new();
    let (_, raw_html, _) = engine
        .fetch_page_metadata(&url)
        .await
        .map_err(|e| e.to_string())?;

    // Default to Ollama for now, later we can pass config from frontend settings
    let hooks = engine.try_generate_hooks(&raw_html, None).await;

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
fn gmail_status() -> Result<bool, String> {
    let client = outreach_core::gmail::GmailClient::new();
    Ok(client.is_connected())
}

#[tauri::command]
async fn gmail_connect() -> Result<String, String> {
    use std::thread;

    let client = outreach_core::gmail::GmailClient::new();

    // Get auth URL and PKCE verifier
    let (auth_url, pkce_verifier) = client.get_auth_url().map_err(|e| e.to_string())?;

    // Open browser
    open::that(&auth_url).map_err(|e| format!("Failed to open browser: {}", e))?;

    // Wait for callback in a thread (blocking TcpListener)
    let code = thread::spawn(move || client.wait_for_callback())
        .join()
        .map_err(|_| "OAuth callback thread panicked".to_string())?
        .map_err(|e| e.to_string())?;

    // Exchange code for tokens
    let client = outreach_core::gmail::GmailClient::new();
    client
        .exchange_code(code, pkce_verifier)
        .await
        .map_err(|e| e.to_string())?;

    Ok("Connected successfully!".to_string())
}

#[tauri::command]
fn gmail_disconnect() -> Result<(), String> {
    let client = outreach_core::gmail::GmailClient::new();
    client.disconnect().map_err(|e| e.to_string())
}

#[tauri::command]
async fn send_email(to: String, subject: String, body: String) -> Result<String, String> {
    let client = outreach_core::gmail::GmailClient::new();
    client
        .send_email(&to, &subject, &body)
        .await
        .map_err(|e| e.to_string())
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
        .unwrap_or_else(|| "google/gemini-2.0-flash-exp:free".to_string());
    let base_url = settings
        .get("ai_base_url")
        .await
        .map_err(|e| e.to_string())?
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
        config.openrouter_api_key = get_api_key(service).ok();
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
        .unwrap_or_else(|| "google/gemini-2.0-flash-exp:free".to_string());
    let base_url = settings
        .get("ai_base_url")
        .await
        .map_err(|e| e.to_string())?
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
        config.openrouter_api_key = get_api_key(service).ok();
    }

    let email_ai = outreach_core::EmailAI::new(config);
    email_ai
        .generate_subject_lines(&contact)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn save_api_key(service: String, key: String) -> Result<(), String> {
    let entry = keyring::Entry::new("PersonalCRM", &service).map_err(|e| e.to_string())?;
    entry.set_password(&key).map_err(|e| e.to_string())
}

fn get_api_key(service: &str) -> Result<String, String> {
    let entry = keyring::Entry::new("PersonalCRM", service).map_err(|e| e.to_string())?;
    entry.get_password().map_err(|e| e.to_string())
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

#[tauri::command]
fn import_preview(file_path: String) -> Result<outreach_core::import::ImportPreview, String> {
    outreach_core::import::preview_file(&file_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn import_contacts(
    db: tauri::State<'_, Db>,
    file_path: String,
    mapping: outreach_core::import::ColumnMapping,
) -> Result<usize, String> {
    let contacts = outreach_core::import::parse_file_with_mapping(&file_path, &mapping)
        .map_err(|e| e.to_string())?;

    let pool = db.pool();
    let mut count = 0;

    for contact in contacts {
        let id = uuid::Uuid::new_v4().to_string();
        let result = sqlx::query(
            "INSERT INTO contacts (id, first_name, last_name, email, linkedin_url, status, status_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
        )
            .bind(&id)
            .bind(&contact.first_name)
            .bind(&contact.last_name)
            .bind(&contact.email)
            .bind(&contact.linkedin_url)
            .bind("New")
            .bind("stat-new")
            .execute(pool)
            .await;

        if result.is_ok() {
            count += 1;
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
