use axum::{
    extract::{Query, State},
    response::sse::{Event, KeepAlive, Sse},
    response::IntoResponse,
    Json,
};
use futures::StreamExt;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{mpsc, RwLock};

use crate::api::AppState;

type SseEvent = Result<Event, std::convert::Infallible>;
pub type SessionMap = Arc<RwLock<HashMap<String, mpsc::UnboundedSender<SseEvent>>>>;

#[derive(Deserialize)]
pub struct MessageQuery {
    pub session_id: String,
}

pub async fn sse_handler(
    State(state): State<AppState>,
) -> Sse<impl futures::Stream<Item = SseEvent>> {
    let session_id = uuid::Uuid::new_v4().to_string();
    let (tx, mut rx) = mpsc::unbounded_channel::<SseEvent>();

    let sessions = state.sse_sessions.clone();
    sessions.write().await.insert(session_id.clone(), tx);

    #[cfg(debug_assertions)]
    println!("[API] SSE session created: {}", session_id);

    let endpoint_url = format!("/api/v1/sse/message?sessionId={}", session_id);
    let endpoint_event: SseEvent = Ok(Event::default().event("endpoint").data(endpoint_url));

    let cleanup_id = session_id.clone();
    let cleanup_sessions = sessions.clone();

    let stream = async_stream::stream! {
        yield endpoint_event;
        while let Some(event) = rx.recv().await {
            yield event;
        }
        cleanup_sessions.write().await.remove(&cleanup_id);
        #[cfg(debug_assertions)]
        println!("[API] SSE session cleaned up: {}", cleanup_id);
    };

    Sse::new(stream.boxed()).keep_alive(KeepAlive::default())
}

pub async fn sse_message_handler(
    State(state): State<AppState>,
    Query(query): Query<MessageQuery>,
    Json(body): Json<Value>,
) -> impl IntoResponse {
    let session_id = query.session_id;

    let sessions = state.sse_sessions.clone();
    let tx = match sessions.read().await.get(&session_id) {
        Some(tx) => tx.clone(),
        None => {
            #[cfg(debug_assertions)]
            eprintln!("[API Error] SSE session not found: {}", session_id);
            return (
                axum::http::StatusCode::NOT_FOUND,
                "Session not found or expired",
            )
                .into_response();
        }
    };

    let response = handle_json_rpc(body, &state).await;

    if response.is_empty() {
        return axum::http::StatusCode::ACCEPTED.into_response();
    }

    let event: SseEvent = Ok(Event::default().data(&response));
    if tx.send(event).is_err() {
        sessions.write().await.remove(&session_id);
        #[cfg(debug_assertions)]
        eprintln!(
            "[API Error] SSE session disconnected, removed: {}",
            session_id
        );
    }

    axum::http::StatusCode::ACCEPTED.into_response()
}

async fn handle_json_rpc(request: Value, state: &AppState) -> String {
    let method = request["method"].as_str().unwrap_or("");
    let id = request.get("id").cloned();

    match method {
        "initialize" => json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "jobdex-mcp", "version": "0.1.0" }
            }
        })
        .to_string(),

        "notifications/initialized" => String::new(),

        "tools/list" => json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": { "tools": get_tool_definitions() }
        })
        .to_string(),

        "tools/call" => {
            let tool_name = request["params"]["name"].as_str().unwrap_or("");
            let arguments = &request["params"]["arguments"];

            match call_tool_via_api(tool_name, arguments, state).await {
                Ok(data) => json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "result": {
                        "content": [{ "type": "text", "text": data }]
                    }
                }),
                Err(e) => json!({
                    "jsonrpc": "2.0",
                    "id": id,
                    "error": { "code": -32000, "message": e }
                }),
            }
            .to_string()
        }

        _ => json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": { "code": -32601, "message": "Method not found" }
        })
        .to_string(),
    }
}

async fn call_tool_via_api(name: &str, args: &Value, state: &AppState) -> Result<String, String> {
    let api_key = get_api_key(&state.pool)
        .await
        .ok_or("API key not configured")?;
    let port = get_api_port(&state.pool).await;
    let base = format!("http://127.0.0.1:{}", port);
    let client = reqwest::Client::new();

    match name {
        "list_contacts" => {
            let mut url = format!("{}/api/v1/contacts", base);
            let mut params = vec![];
            if let Some(s) = args["status_id"].as_str() {
                params.push(format!("status_id={}", s));
            }
            if let Some(t) = args["tag"].as_str() {
                params.push(format!("tag={}", t));
            }
            if let Some(q) = args["search"].as_str() {
                params.push(format!("search={}", q));
            }
            if !params.is_empty() {
                url.push_str(&format!("?{}", params.join("&")));
            }
            api_get(&client, &url, &api_key).await
        }

        "get_contact" => {
            let id = args["id"].as_str().ok_or("Missing id")?;
            api_get(
                &client,
                &format!("{}/api/v1/contacts/{}", base, id),
                &api_key,
            )
            .await
        }

        "create_contact" => {
            api_post(
                &client,
                &format!("{}/api/v1/contacts", base),
                &api_key,
                args,
            )
            .await
        }

        "update_contact" => {
            let id = args["id"].as_str().ok_or("Missing id")?;
            let mut body = args.clone();
            if let Some(obj) = body.as_object_mut() {
                obj.remove("id");
            }
            api_patch(
                &client,
                &format!("{}/api/v1/contacts/{}", base, id),
                &api_key,
                &body,
            )
            .await
        }

        "delete_contact" => {
            let id = args["id"].as_str().ok_or("Missing id")?;
            api_delete(
                &client,
                &format!("{}/api/v1/contacts/{}", base, id),
                &api_key,
            )
            .await
        }

        "search_contacts" => {
            let q = args["q"].as_str().ok_or("Missing q")?;
            api_get(
                &client,
                &format!("{}/api/v1/search?q={}", base, q),
                &api_key,
            )
            .await
        }

        "list_statuses" => api_get(&client, &format!("{}/api/v1/statuses", base), &api_key).await,

        "create_status" => {
            api_post(
                &client,
                &format!("{}/api/v1/statuses", base),
                &api_key,
                args,
            )
            .await
        }

        "update_status" => {
            let id = args["id"].as_str().ok_or("Missing id")?;
            let mut body = args.clone();
            if let Some(obj) = body.as_object_mut() {
                obj.remove("id");
            }
            api_patch(
                &client,
                &format!("{}/api/v1/statuses/{}", base, id),
                &api_key,
                &body,
            )
            .await
        }

        "delete_status" => {
            let id = args["id"].as_str().ok_or("Missing id")?;
            api_delete(
                &client,
                &format!("{}/api/v1/statuses/{}", base, id),
                &api_key,
            )
            .await
        }

        "list_tags" => api_get(&client, &format!("{}/api/v1/tags", base), &api_key).await,

        "create_tag" => api_post(&client, &format!("{}/api/v1/tags", base), &api_key, args).await,

        "assign_tag" => {
            let contact_id = args["contact_id"].as_str().ok_or("Missing contact_id")?;
            let tag_id = args["tag_id"].as_str().ok_or("Missing tag_id")?;
            api_post_empty(
                &client,
                &format!("{}/api/v1/contacts/{}/tags/{}", base, contact_id, tag_id),
                &api_key,
            )
            .await
        }

        "unassign_tag" => {
            let contact_id = args["contact_id"].as_str().ok_or("Missing contact_id")?;
            let tag_id = args["tag_id"].as_str().ok_or("Missing tag_id")?;
            api_delete(
                &client,
                &format!("{}/api/v1/contacts/{}/tags/{}", base, contact_id, tag_id),
                &api_key,
            )
            .await
        }

        "list_email_accounts" => {
            api_get(
                &client,
                &format!("{}/api/v1/email-accounts", base),
                &api_key,
            )
            .await
        }

        "send_email" => {
            api_post(
                &client,
                &format!("{}/api/v1/emails/send", base),
                &api_key,
                args,
            )
            .await
        }

        "schedule_email" => {
            api_post(
                &client,
                &format!("{}/api/v1/emails/schedule", base),
                &api_key,
                args,
            )
            .await
        }

        "list_scheduled_emails" => {
            api_get(
                &client,
                &format!("{}/api/v1/emails/scheduled", base),
                &api_key,
            )
            .await
        }

        "cancel_scheduled_email" => {
            let id = args["id"].as_str().ok_or("Missing id")?;
            api_delete(
                &client,
                &format!("{}/api/v1/emails/scheduled/{}", base, id),
                &api_key,
            )
            .await
        }

        "list_emails_for_contact" => {
            let id = args["id"].as_str().ok_or("Missing id")?;
            api_get(
                &client,
                &format!("{}/api/v1/contacts/{}/emails", base, id),
                &api_key,
            )
            .await
        }

        "list_templates" => api_get(&client, &format!("{}/api/v1/templates", base), &api_key).await,

        "create_template" => {
            api_post(
                &client,
                &format!("{}/api/v1/templates", base),
                &api_key,
                args,
            )
            .await
        }

        "delete_template" => {
            let id = args["id"].as_str().ok_or("Missing id")?;
            api_delete(
                &client,
                &format!("{}/api/v1/templates/{}", base, id),
                &api_key,
            )
            .await
        }

        "get_contact_activity" => {
            let id = args["id"].as_str().ok_or("Missing id")?;
            api_get(
                &client,
                &format!("{}/api/v1/contacts/{}/activity", base, id),
                &api_key,
            )
            .await
        }

        "create_contact_event" => {
            let id = args["contact_id"].as_str().ok_or("Missing contact_id")?;
            let mut body = args.clone();
            if let Some(obj) = body.as_object_mut() {
                obj.remove("contact_id");
            }
            api_post(
                &client,
                &format!("{}/api/v1/contacts/{}/events", base, id),
                &api_key,
                &body,
            )
            .await
        }

        "export_data" => api_get(&client, &format!("{}/api/v1/data/export", base), &api_key).await,

        "get_pipeline_summary" => {
            api_get(
                &client,
                &format!("{}/api/v1/pipeline-summary", base),
                &api_key,
            )
            .await
        }

        "get_overdue_followups" => {
            api_get(
                &client,
                &format!("{}/api/v1/overdue-followups", base),
                &api_key,
            )
            .await
        }

        _ => Err(format!("Unknown tool: {}", name)),
    }
}

async fn api_get(client: &reqwest::Client, url: &str, api_key: &str) -> Result<String, String> {
    let resp = client
        .get(url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if resp.status().is_success() {
        resp.text()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))
    } else {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        Err(format!("API error {}: {}", status, body))
    }
}

async fn api_post(
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
    body: &Value,
) -> Result<String, String> {
    let resp = client
        .post(url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(body)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if resp.status().is_success() {
        resp.text()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))
    } else {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        Err(format!("API error {}: {}", status, body))
    }
}

async fn api_post_empty(
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
) -> Result<String, String> {
    let resp = client
        .post(url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if resp.status().is_success() {
        resp.text()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))
    } else {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        Err(format!("API error {}: {}", status, body))
    }
}

async fn api_patch(
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
    body: &Value,
) -> Result<String, String> {
    let resp = client
        .patch(url)
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .json(body)
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if resp.status().is_success() {
        resp.text()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))
    } else {
        let status = resp.status();
        let body_text = resp.text().await.unwrap_or_default();
        Err(format!("API error {}: {}", status, body_text))
    }
}

async fn api_delete(client: &reqwest::Client, url: &str, api_key: &str) -> Result<String, String> {
    let resp = client
        .delete(url)
        .header("Authorization", format!("Bearer {}", api_key))
        .send()
        .await
        .map_err(|e| format!("HTTP request failed: {}", e))?;

    if resp.status().is_success() {
        resp.text()
            .await
            .map_err(|e| format!("Failed to read response: {}", e))
    } else {
        let status = resp.status();
        let body = resp.text().await.unwrap_or_default();
        Err(format!("API error {}: {}", status, body))
    }
}

async fn get_api_key(pool: &sqlx::SqlitePool) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = 'api_key'")
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}

async fn get_api_port(pool: &sqlx::SqlitePool) -> u16 {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = 'api_port'")
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .and_then(|v| v.parse().ok())
        .unwrap_or(13420)
}

fn get_tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "name": "list_contacts",
            "description": "Get all contacts in your JobDex CRM. Optionally filter by pipeline stage, tag, or search term.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "status_id": { "type": "string", "description": "Filter by pipeline stage ID." },
                    "tag": { "type": "string", "description": "Filter by tag name." },
                    "search": { "type": "string", "description": "Search across name, email, company, and title." }
                }
            }
        }),
        json!({
            "name": "get_contact",
            "description": "Get a single contact by ID with full details including tags and status.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string", "description": "The contact ID." }
                },
                "required": ["id"]
            }
        }),
        json!({
            "name": "create_contact",
            "description": "Add a person to your outreach pipeline. You need at least their first and last name.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "first_name": { "type": "string", "description": "Given name." },
                    "last_name": { "type": "string", "description": "Family name." },
                    "email": { "type": "string", "description": "Email address." },
                    "company": { "type": "string", "description": "Company." },
                    "title": { "type": "string", "description": "Job title." },
                    "location": { "type": "string", "description": "City or region." },
                    "linkedin_url": { "type": "string", "description": "LinkedIn profile URL." },
                    "company_website": { "type": "string", "description": "Company website URL." },
                    "status_id": { "type": "string", "description": "Pipeline stage ID." }
                },
                "required": ["first_name", "last_name"]
            }
        }),
        json!({
            "name": "update_contact",
            "description": "Update an existing contact. Only provided fields are changed.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" },
                    "first_name": { "type": "string" },
                    "last_name": { "type": "string" },
                    "email": { "type": "string" },
                    "company": { "type": "string" },
                    "title": { "type": "string" },
                    "location": { "type": "string" },
                    "linkedin_url": { "type": "string" },
                    "company_website": { "type": "string" },
                    "status_id": { "type": "string" },
                    "summary": { "type": "string" }
                },
                "required": ["id"]
            }
        }),
        json!({
            "name": "delete_contact",
            "description": "Permanently delete a contact and all their associated data.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "id": { "type": "string" }
                },
                "required": ["id"]
            }
        }),
        json!({
            "name": "search_contacts",
            "description": "Search across contacts by name, email, company, or title. Also searches tags.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "q": { "type": "string", "description": "Search query." }
                },
                "required": ["q"]
            }
        }),
        json!({
            "name": "list_statuses",
            "description": "Get all pipeline stages with IDs, labels, and colors.",
            "inputSchema": { "type": "object", "properties": {} }
        }),
        json!({
            "name": "create_status",
            "description": "Create a new pipeline stage.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "label": { "type": "string" },
                    "color": { "type": "string", "description": "Hex color e.g. '#3b82f6'." }
                },
                "required": ["label", "color"]
            }
        }),
        json!({
            "name": "update_status",
            "description": "Rename or recolor a pipeline stage.",
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "string" }, "label": { "type": "string" }, "color": { "type": "string" } },
                "required": ["id"]
            }
        }),
        json!({
            "name": "delete_status",
            "description": "Remove a pipeline stage. Contacts in it will be unassigned.",
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "string" } },
                "required": ["id"]
            }
        }),
        json!({
            "name": "list_tags",
            "description": "Get all tags.",
            "inputSchema": { "type": "object", "properties": {} }
        }),
        json!({
            "name": "create_tag",
            "description": "Create a new tag.",
            "inputSchema": {
                "type": "object",
                "properties": { "name": { "type": "string" }, "color": { "type": "string" } },
                "required": ["name", "color"]
            }
        }),
        json!({
            "name": "assign_tag",
            "description": "Assign a tag to a contact.",
            "inputSchema": {
                "type": "object",
                "properties": { "contact_id": { "type": "string" }, "tag_id": { "type": "string" } },
                "required": ["contact_id", "tag_id"]
            }
        }),
        json!({
            "name": "unassign_tag",
            "description": "Remove a tag from a contact.",
            "inputSchema": {
                "type": "object",
                "properties": { "contact_id": { "type": "string" }, "tag_id": { "type": "string" } },
                "required": ["contact_id", "tag_id"]
            }
        }),
        json!({
            "name": "list_email_accounts",
            "description": "Get connected email accounts.",
            "inputSchema": { "type": "object", "properties": {} }
        }),
        json!({
            "name": "send_email",
            "description": "Send an email immediately.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "account_id": { "type": "string" },
                    "to": { "type": "string" },
                    "subject": { "type": "string" },
                    "body": { "type": "string" },
                    "contact_id": { "type": "string" }
                },
                "required": ["account_id", "to", "subject", "body"]
            }
        }),
        json!({
            "name": "schedule_email",
            "description": "Schedule an email to be sent at a future date and time.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "account_id": { "type": "string" },
                    "contact_id": { "type": "string" },
                    "subject": { "type": "string" },
                    "body": { "type": "string" },
                    "scheduled_at": { "type": "integer", "description": "Unix timestamp (seconds) for when to send." }
                },
                "required": ["account_id", "contact_id", "subject", "body", "scheduled_at"]
            }
        }),
        json!({
            "name": "list_scheduled_emails",
            "description": "Get all pending and failed scheduled emails.",
            "inputSchema": { "type": "object", "properties": {} }
        }),
        json!({
            "name": "cancel_scheduled_email",
            "description": "Cancel a pending scheduled email.",
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "string" } },
                "required": ["id"]
            }
        }),
        json!({
            "name": "list_emails_for_contact",
            "description": "Get all email messages for a contact.",
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "string" } },
                "required": ["id"]
            }
        }),
        json!({
            "name": "list_templates",
            "description": "Get all email templates.",
            "inputSchema": { "type": "object", "properties": {} }
        }),
        json!({
            "name": "create_template",
            "description": "Create or update an email template.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": { "type": "string" },
                    "subject": { "type": "string" },
                    "body": { "type": "string" }
                },
                "required": ["name"]
            }
        }),
        json!({
            "name": "delete_template",
            "description": "Delete an email template.",
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "string" } },
                "required": ["id"]
            }
        }),
        json!({
            "name": "get_contact_activity",
            "description": "Get the activity timeline for a contact.",
            "inputSchema": {
                "type": "object",
                "properties": { "id": { "type": "string" } },
                "required": ["id"]
            }
        }),
        json!({
            "name": "create_contact_event",
            "description": "Add an event to a contact's timeline.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "contact_id": { "type": "string" },
                    "title": { "type": "string" },
                    "description": { "type": "string" },
                    "event_date": { "type": "string", "description": "ISO date string." }
                },
                "required": ["contact_id", "title"]
            }
        }),
        json!({
            "name": "export_data",
            "description": "Export all CRM data as JSON.",
            "inputSchema": { "type": "object", "properties": {} }
        }),
        json!({
            "name": "get_pipeline_summary",
            "description": "Get a count of contacts in each pipeline stage.",
            "inputSchema": { "type": "object", "properties": {} }
        }),
        json!({
            "name": "get_overdue_followups",
            "description": "Get contacts that are overdue for a follow-up.",
            "inputSchema": { "type": "object", "properties": {} }
        }),
    ]
}
