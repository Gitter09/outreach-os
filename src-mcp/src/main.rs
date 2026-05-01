use anyhow::Result;
use clap::Parser;
use serde_json::{json, Value};
use std::io::Write;
use tokio::io::AsyncBufReadExt;

#[derive(Parser, Debug)]
#[command(
    name = "jobdex-mcp",
    about = "JobDex MCP Server — stdio JSON-RPC relay"
)]
struct Args {
    #[arg(long, env = "JOBDEX_API_URL")]
    api_url: String,

    #[arg(long, env = "JOBDEX_API_KEY")]
    api_key: String,

    #[arg(long, default_value = "warn")]
    log_level: String,
}

fn log_err(msg: &str) {
    let _ = std::io::stderr().write_all(format!("[MCP Error] {}\n", msg).as_bytes());
}

#[allow(dead_code)]
#[cfg(debug_assertions)]
fn log_dbg(msg: &str) {
    let _ = std::io::stderr().write_all(format!("[MCP] {}\n", msg).as_bytes());
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
            "description": "Schedule an email for future delivery.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "account_id": { "type": "string" },
                    "contact_id": { "type": "string" },
                    "subject": { "type": "string" },
                    "body": { "type": "string" },
                    "scheduled_at": { "type": "integer", "description": "Unix timestamp." }
                },
                "required": ["account_id", "contact_id", "subject", "body", "scheduled_at"]
            }
        }),
        json!({
            "name": "list_scheduled_emails",
            "description": "Get pending and failed scheduled emails.",
            "inputSchema": {
                "type": "object",
                "properties": { "contact_id": { "type": "string" } }
            }
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
            "description": "Get email history for a contact.",
            "inputSchema": {
                "type": "object",
                "properties": { "contact_id": { "type": "string" } },
                "required": ["contact_id"]
            }
        }),
        json!({
            "name": "list_templates",
            "description": "Get all email templates.",
            "inputSchema": { "type": "object", "properties": {} }
        }),
        json!({
            "name": "create_template",
            "description": "Create or update an email template. Use {{firstName}} and {{lastName}} for merge variables.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": { "type": "string" },
                    "subject": { "type": "string" },
                    "body": { "type": "string" },
                    "id": { "type": "string" }
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
                "properties": { "contact_id": { "type": "string" } },
                "required": ["contact_id"]
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
                    "event_at": { "type": "string", "description": "ISO 8601 datetime." }
                },
                "required": ["contact_id", "title"]
            }
        }),
        json!({
            "name": "export_data",
            "description": "Export all JobDex data as JSON.",
            "inputSchema": { "type": "object", "properties": {} }
        }),
        json!({
            "name": "get_pipeline_summary",
            "description": "Get counts of contacts per pipeline stage.",
            "inputSchema": { "type": "object", "properties": {} }
        }),
        json!({
            "name": "get_overdue_followups",
            "description": "Get contacts whose next follow-up date has passed.",
            "inputSchema": { "type": "object", "properties": {} }
        }),
    ]
}

fn build_url_for_tool(name: &str, args: &Value, base_url: &str) -> String {
    let base = base_url.trim_end_matches('/');
    match name {
        "get_contact" | "update_contact" | "delete_contact" => {
            if let Some(id) = args.get("id").and_then(|v| v.as_str()) {
                format!("{}/api/v1/contacts/{}", base, id)
            } else {
                format!("{}/api/v1/contacts", base)
            }
        }
        "update_status" | "delete_status" => {
            if let Some(id) = args.get("id").and_then(|v| v.as_str()) {
                format!("{}/api/v1/statuses/{}", base, id)
            } else {
                format!("{}/api/v1/statuses", base)
            }
        }
        "list_emails_for_contact" => {
            if let Some(id) = args.get("contact_id").and_then(|v| v.as_str()) {
                format!("{}/api/v1/contacts/{}/emails", base, id)
            } else {
                format!("{}/api/v1/contacts", base)
            }
        }
        "get_contact_activity" => {
            if let Some(id) = args.get("contact_id").and_then(|v| v.as_str()) {
                format!("{}/api/v1/contacts/{}/activity", base, id)
            } else {
                format!("{}/api/v1/contacts", base)
            }
        }
        "assign_tag" => {
            if let (Some(cid), Some(tid)) = (
                args.get("contact_id").and_then(|v| v.as_str()),
                args.get("tag_id").and_then(|v| v.as_str()),
            ) {
                format!("{}/api/v1/contacts/{}/tags/{}", base, cid, tid)
            } else {
                format!("{}/api/v1/contacts", base)
            }
        }
        "unassign_tag" => {
            if let (Some(cid), Some(tid)) = (
                args.get("contact_id").and_then(|v| v.as_str()),
                args.get("tag_id").and_then(|v| v.as_str()),
            ) {
                format!("{}/api/v1/contacts/{}/tags/{}", base, cid, tid)
            } else {
                format!("{}/api/v1/contacts", base)
            }
        }
        "create_contact_event" => {
            if let Some(id) = args.get("contact_id").and_then(|v| v.as_str()) {
                format!("{}/api/v1/contacts/{}/events", base, id)
            } else {
                format!("{}/api/v1/contacts", base)
            }
        }
        "cancel_scheduled_email" => {
            if let Some(id) = args.get("id").and_then(|v| v.as_str()) {
                format!("{}/api/v1/emails/scheduled/{}", base, id)
            } else {
                format!("{}/api/v1/emails/scheduled", base)
            }
        }
        "delete_template" => {
            if let Some(id) = args.get("id").and_then(|v| v.as_str()) {
                format!("{}/api/v1/templates/{}", base, id)
            } else {
                format!("{}/api/v1/templates", base)
            }
        }
        "list_contacts" => format!("{}/api/v1/contacts", base),
        "create_contact" => format!("{}/api/v1/contacts", base),
        "search_contacts" => format!("{}/api/v1/search", base),
        "list_statuses" => format!("{}/api/v1/statuses", base),
        "create_status" => format!("{}/api/v1/statuses", base),
        "list_tags" => format!("{}/api/v1/tags", base),
        "create_tag" => format!("{}/api/v1/tags", base),
        "list_email_accounts" => format!("{}/api/v1/email-accounts", base),
        "send_email" => format!("{}/api/v1/emails/send", base),
        "schedule_email" => format!("{}/api/v1/emails/schedule", base),
        "list_scheduled_emails" => format!("{}/api/v1/emails/scheduled", base),
        "list_templates" => format!("{}/api/v1/templates", base),
        "create_template" => format!("{}/api/v1/templates", base),
        "export_data" => format!("{}/api/v1/data/export", base),
        "get_pipeline_summary" => format!("{}/api/v1/pipeline-summary", base),
        "get_overdue_followups" => format!("{}/api/v1/overdue-followups", base),
        _ => format!("{}/api/v1/", base),
    }
}

fn http_method_for_tool(name: &str) -> &'static str {
    match name {
        "list_contacts"
        | "list_statuses"
        | "list_tags"
        | "list_email_accounts"
        | "list_scheduled_emails"
        | "list_emails_for_contact"
        | "list_templates"
        | "search_contacts"
        | "get_contact"
        | "get_contact_activity"
        | "export_data"
        | "get_pipeline_summary"
        | "get_overdue_followups" => "GET",
        "delete_contact"
        | "delete_status"
        | "cancel_scheduled_email"
        | "unassign_tag"
        | "delete_template" => "DELETE",
        _ => "POST",
    }
}

fn build_query_params<'a>(name: &'a str, args: &Value) -> Vec<(&'a str, String)> {
    let mut params = Vec::new();
    match name {
        "list_contacts" => {
            if let Some(v) = args.get("status_id").and_then(|v| v.as_str()) {
                params.push(("status_id", v.to_string()));
            }
            if let Some(v) = args.get("tag").and_then(|v| v.as_str()) {
                params.push(("tag", v.to_string()));
            }
            if let Some(v) = args.get("search").and_then(|v| v.as_str()) {
                params.push(("search", v.to_string()));
            }
        }
        "list_scheduled_emails" => {
            if let Some(v) = args.get("contact_id").and_then(|v| v.as_str()) {
                params.push(("contact_id", v.to_string()));
            }
        }
        "search_contacts" => {
            if let Some(v) = args.get("q").and_then(|v| v.as_str()) {
                params.push(("q", v.to_string()));
            }
        }
        _ => {}
    }
    params
}

#[tokio::main]
async fn main() -> Result<()> {
    let args = Args::parse();

    #[cfg(debug_assertions)]
    eprintln!("[MCP] Starting jobdex-mcp, connecting to {}", args.api_url);

    let client = reqwest::Client::new();
    let stdin = tokio::io::BufReader::new(tokio::io::stdin());
    let mut lines = stdin.lines();

    loop {
        let line = match lines.next_line().await {
            Ok(Some(l)) => l,
            Ok(None) => break,
            Err(e) => {
                log_err(&format!("Error reading stdin: {}", e));
                break;
            }
        };

        let request: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(e) => {
                log_err(&format!("Invalid JSON-RPC: {}", e));
                continue;
            }
        };

        let is_notification = match &request {
            Value::Object(map) => !map.contains_key("id"),
            _ => false,
        };
        let method = request.get("method").and_then(|m| m.as_str()).unwrap_or("");

        if is_notification {
            continue;
        }

        let id = request.get("id").cloned();

        let response = match method {
            "initialize" => json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": "jobdex-mcp", "version": "0.1.0" }
                }
            }),
            "tools/list" => json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": { "tools": get_tool_definitions() }
            }),
            "tools/call" => {
                let tool_name = request["params"]["name"].as_str().unwrap_or("");
                let arguments = &request["params"]["arguments"];

                #[cfg(debug_assertions)]
                eprintln!("[MCP] Calling tool: {}", tool_name);

                let url = build_url_for_tool(tool_name, arguments, &args.api_url);
                let method = http_method_for_tool(tool_name);

                let result = match method {
                    "GET" => {
                        let params = build_query_params(tool_name, arguments);
                        if params.is_empty() {
                            client.get(&url).bearer_auth(&args.api_key).send().await
                        } else {
                            client
                                .get(&url)
                                .bearer_auth(&args.api_key)
                                .query(&params)
                                .send()
                                .await
                        }
                    }
                    "DELETE" => client.delete(&url).bearer_auth(&args.api_key).send().await,
                    _ => {
                        client
                            .post(&url)
                            .bearer_auth(&args.api_key)
                            .json(arguments)
                            .send()
                            .await
                    }
                };

                match result {
                    Ok(resp) => {
                        let body: String = resp
                            .text()
                            .await
                            .unwrap_or_else(|e| format!("Error reading response: {}", e));
                        json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "result": { "content": [{ "type": "text", "text": body }] }
                        })
                    }
                    Err(e) => {
                        log_err(&format!("HTTP request failed: {}", e));
                        json!({
                            "jsonrpc": "2.0",
                            "id": id,
                            "error": { "code": -32000, "message": format!("Request failed: {}", e) }
                        })
                    }
                }
            }
            _ => json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": { "code": -32601, "message": "Method not found" }
            }),
        };

        println!("{}", serde_json::to_string(&response)?);
        let _ = std::io::stdout().flush();
    }

    #[cfg(debug_assertions)]
    eprintln!("[MCP] Shutting down.");
    Ok(())
}
