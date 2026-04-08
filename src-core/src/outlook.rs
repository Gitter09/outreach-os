use anyhow::{anyhow, Result};
use base64::prelude::BASE64_STANDARD;
use base64::Engine;
use oauth2::{
    basic::BasicClient, AuthUrl, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge,
    PkceCodeVerifier, RedirectUrl, Scope, TokenUrl,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;

const MS_AUTH_URL: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const MS_TOKEN_URL: &str = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
// Scopes: Offline (refresh), Send, User.Read (profile), Mail.Read (sync)
const MS_SCOPES: &[&str] = &[
    "offline_access",
    "https://graph.microsoft.com/User.Read",
    "https://graph.microsoft.com/Mail.Send",
    "https://graph.microsoft.com/Mail.Read",
];

// Default Client ID baked in at compile time (optional build-time override)
const DEFAULT_OUTLOOK_CLIENT_ID: &str = match option_env!("OUTLOOK_CLIENT_ID") {
    Some(id) => id,
    None => "PLACEHOLDER_OUTLOOK_CLIENT_ID",
};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OAuthTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct FullTokenResponse {
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<i64>,
}

pub struct OutlookClient {
    http_client: Client,
}

impl Default for OutlookClient {
    fn default() -> Self {
        Self::new()
    }
}

impl OutlookClient {
    pub fn new() -> Self {
        Self {
            http_client: Client::new(),
        }
    }

    fn load_credentials(&self) -> Result<(String, Option<String>)> {
        // Try to load from keychain first (user override)
        let client_id = crate::crypto::get_credential("outlook", "client_id")
            .unwrap_or_else(|_| DEFAULT_OUTLOOK_CLIENT_ID.to_string());

        if client_id == "PLACEHOLDER_OUTLOOK_CLIENT_ID" || client_id.trim().is_empty() {
            return Err(anyhow!("Outlook credentials not configured. Standard login is currently disabled while in beta."));
        }

        let mut client_secret = crate::crypto::get_credential("outlook", "client_secret").ok();
        if let Some(ref sec) = client_secret {
            if sec.trim().is_empty() {
                client_secret = None;
            }
        }

        Ok((client_id, client_secret))
    }

    /// Starts the OAuth flow. Returns (auth_url, pkce_verifier, csrf_token).
    pub fn get_auth_url(&self, port: u16) -> Result<(String, PkceCodeVerifier, CsrfToken)> {
        let (client_id, client_secret) = self.load_credentials()?;

        let redirect_url = format!("http://localhost:{}", port);

        let mut client = BasicClient::new(ClientId::new(client_id))
            .set_auth_uri(AuthUrl::new(MS_AUTH_URL.to_string())?)
            .set_token_uri(TokenUrl::new(MS_TOKEN_URL.to_string())?)
            .set_redirect_uri(RedirectUrl::new(redirect_url)?);

        if let Some(secret) = client_secret {
            client = client.set_client_secret(ClientSecret::new(secret));
        }

        let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

        let mut auth_req = client
            .authorize_url(CsrfToken::new_random)
            .set_pkce_challenge(pkce_challenge);

        for scope in MS_SCOPES {
            auth_req = auth_req.add_scope(Scope::new(scope.to_string()));
        }

        let (auth_url, csrf_token) = auth_req.url();

        Ok((auth_url.to_string(), pkce_verifier, csrf_token))
    }

    /// Waits for the OAuth callback on a pre-bound listener.
    /// Validates the CSRF `state` parameter against the expected token.
    pub fn wait_for_callback(
        &self,
        listener: TcpListener,
        expected_csrf: &CsrfToken,
    ) -> Result<String> {
        println!("Waiting for Outlook callback...");

        for mut stream in listener.incoming().flatten() {
            let mut reader = BufReader::new(&stream);
            let mut request_line = String::new();
            reader.read_line(&mut request_line)?;

            if let Some((code, state)) = extract_code_and_state_from_request(&request_line) {
                if state != *expected_csrf.secret() {
                    let html = crate::oauth_html::get_error_html(
                        "The OAuth callback state does not match. Please try again.",
                    );
                    let response = format!(
                        "HTTP/1.1 403 Forbidden\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}",
                        html.len(),
                        html
                    );
                    stream.write_all(response.as_bytes())?;
                    return Err(anyhow!("OAuth CSRF token mismatch — possible attack"));
                }

                let html = crate::oauth_html::get_success_html("Outlook");
                let response = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\n\r\n{}",
                    html.len(),
                    html
                );
                stream.write_all(response.as_bytes())?;
                return Ok(code);
            }
        }
        Err(anyhow!("Failed to receive OAuth callback"))
    }

    /// Exchanges authorization code for tokens
    pub async fn exchange_code(
        &self,
        code: String,
        pkce_verifier: PkceCodeVerifier,
        port: u16,
    ) -> Result<OAuthTokenResponse> {
        let (client_id, client_secret) = self.load_credentials()?;
        let redirect_url = format!("http://localhost:{}", port);

        let mut params = vec![
            ("client_id", client_id.as_str()),
            ("code", code.as_str()),
            ("code_verifier", pkce_verifier.secret()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_url.as_str()),
        ];
        
        if let Some(ref sec) = client_secret {
            params.push(("client_secret", sec.as_str()));
        }

        let response = self
            .http_client
            .post(MS_TOKEN_URL)
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error = response.text().await?;
            return Err(anyhow!("Token exchange failed: {}", error));
        }

        let token_response: FullTokenResponse = response.json().await?;

        Ok(OAuthTokenResponse {
            access_token: token_response.access_token,
            refresh_token: token_response.refresh_token,
            expires_in: token_response.expires_in,
        })
    }

    /// Refreshes the access token
    pub async fn refresh_token(&self, refresh_token: &str) -> Result<OAuthTokenResponse> {
        let (client_id, client_secret) = self.load_credentials()?;

        let mut params = vec![
            ("client_id", client_id.as_str()),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
        ];

        if let Some(ref sec) = client_secret {
            params.push(("client_secret", sec.as_str()));
        }

        let response = self
            .http_client
            .post(MS_TOKEN_URL)
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error = response.text().await?;
            return Err(anyhow!("Token refresh failed: {}", error));
        }

        let token_response: FullTokenResponse = response.json().await?;

        Ok(OAuthTokenResponse {
            access_token: token_response.access_token,
            refresh_token: token_response
                .refresh_token
                .or(Some(refresh_token.to_string())),
            expires_in: token_response.expires_in,
        })
    }

    /// Get user profile (email)
    pub async fn get_user_profile(&self, access_token: &str) -> Result<String> {
        let response = self
            .http_client
            .get("https://graph.microsoft.com/v1.0/me")
            .bearer_auth(access_token)
            .send()
            .await?;

        if response.status().is_success() {
            let json: serde_json::Value = response.json().await?;
            let email = json["mail"]
                .as_str()
                .or_else(|| json["userPrincipalName"].as_str())
                .ok_or_else(|| anyhow!("Email field missing in user info"))?;
            Ok(email.to_string())
        } else {
            let error = response.text().await?;
            Err(anyhow!("Failed to fetch user profile: {}", error))
        }
    }

    /// Sends an email via Microsoft Graph API
    pub async fn send_email(
        &self,
        access_token: &str,
        to: &str,
        subject: &str,
        body: &str,
        attachments: &[crate::email_service::OutgoingAttachment],
    ) -> Result<String> {
        // Build attachments array for Graph API
        let mut att_json: Vec<serde_json::Value> = Vec::new();
        for att in attachments {
            let file_bytes = tokio::fs::read(&att.path).await?;
            let b64 = BASE64_STANDARD.encode(&file_bytes);
            att_json.push(serde_json::json!({
                "@odata.type": "#microsoft.graph.fileAttachment",
                "name": att.filename,
                "contentType": att.mime_type,
                "contentBytes": b64,
            }));
        }

        let mut message = serde_json::json!({
            "subject": subject,
            "body": {
                "contentType": "HTML",
                "content": body
            },
            "toRecipients": [
                {
                    "emailAddress": {
                        "address": to
                    }
                }
            ]
        });
        if !att_json.is_empty() {
            message["attachments"] = serde_json::Value::Array(att_json);
        }

        let request_body = serde_json::json!({
            "message": message,
            "saveToSentItems": "true"
        });

        let response = self
            .http_client
            .post("https://graph.microsoft.com/v1.0/me/sendMail")
            .bearer_auth(access_token)
            .json(&request_body)
            .send()
            .await?;

        if response.status().is_success() {
            Ok("sent".to_string()) // Graph API returns 202 Accepted with no content
        } else {
            let error = response.text().await?;
            Err(anyhow!("Outlook API error: {}", error))
        }
    }

    /// List messages from Outlook (Inbox + Sent), filtered by CRM contacts and timestamp
    pub async fn list_messages(
        &self,
        access_token: &str,
        contact_emails: &[String],
        after_timestamp: Option<i64>,
        max_results: u32,
    ) -> Result<Vec<OutlookMessage>> {
        if contact_emails.is_empty() {
            return Ok(Vec::new());
        }

        // Build base filter for timestamp
        let base_filter = match after_timestamp {
            Some(ts) => {
                let dt = chrono::DateTime::from_timestamp(ts, 0)
                    .unwrap_or_else(chrono::Utc::now)
                    .format("%Y-%m-%dT%H:%M:%SZ")
                    .to_string();
                format!("receivedDateTime ge {}", dt)
            }
            None => String::new(),
        };

        let select = "id,from,toRecipients,subject,body,receivedDateTime,sentDateTime,isDraft";
        let mut all_messages = Vec::new();

        // Partition contact emails to avoid hitting URL length limits
        let chunks = contact_emails.chunks(10); // Outlook filters can get complex, keep chunks small

        for chunk in chunks {
            let mut or_parts = Vec::new();
            for email in chunk {
                // Filter for both sent and received involving this contact
                or_parts.push(format!("(from/emailAddress/address eq '{}' or toRecipients/any(a:a/emailAddress/address eq '{}'))", email, email));
            }

            let contacts_filter = format!("({})", or_parts.join(" or "));
            let final_filter = if base_filter.is_empty() {
                contacts_filter
            } else {
                format!("{} and {}", base_filter, contacts_filter)
            };

            // Fetch from both inbox and sentItems folders
            for folder in &["inbox", "sentItems"] {
                let url = format!(
                    "https://graph.microsoft.com/v1.0/me/mailFolders/{}/messages?$filter={}&$top={}&$select={}",
                    folder,
                    urlencoding::encode(&final_filter),
                    max_results,
                    select
                );

                let response = self
                    .http_client
                    .get(&url)
                    .bearer_auth(access_token)
                    .send()
                    .await?;

                if !response.status().is_success() {
                    let status = response.status();
                    let error_text = response.text().await?;
                    if status.as_u16() == 401 {
                        return Err(anyhow!("TOKEN_EXPIRED"));
                    }
                    // Non-fatal: skip this folder on other errors
                    eprintln!("Outlook list_messages ({}) error: {}", folder, error_text);
                    continue;
                }

                let json: serde_json::Value = response.json().await?;
                if let Some(items) = json["value"].as_array() {
                    for item in items {
                        // Skip drafts
                        if item["isDraft"].as_bool().unwrap_or(false) {
                            continue;
                        }

                        let from_email = item["from"]["emailAddress"]["address"]
                            .as_str()
                            .unwrap_or("")
                            .to_string();

                        let to_email = item["toRecipients"]
                            .as_array()
                            .and_then(|arr| arr.first())
                            .and_then(|r| r["emailAddress"]["address"].as_str())
                            .unwrap_or("")
                            .to_string();

                        let subject = item["subject"].as_str().unwrap_or("").to_string();
                        let body = item["body"]["content"].as_str().unwrap_or("").to_string();
                        let content_type = item["body"]["contentType"]
                            .as_str()
                            .unwrap_or("html")
                            .to_lowercase();
                        let html_body = if content_type == "html" {
                            Some(body.clone())
                        } else {
                            None
                        };

                        // Use sentDateTime if available, else receivedDateTime
                        let date_str = item["sentDateTime"]
                            .as_str()
                            .or_else(|| item["receivedDateTime"].as_str())
                            .unwrap_or("");

                        let sent_at = chrono::DateTime::parse_from_rfc3339(date_str)
                            .map(|d| d.with_timezone(&chrono::Utc))
                            .unwrap_or_else(|_| chrono::Utc::now());

                        let id = item["id"].as_str().unwrap_or("").to_string();
                        all_messages.push(OutlookMessage {
                            id,
                            from_email,
                            to_email,
                            subject,
                            body,
                            html_body,
                            sent_at,
                        });
                    }
                }
            }
        }

        // Deduplicate messages by ID
        all_messages.sort_by(|a, b| a.id.cmp(&b.id));
        all_messages.dedup_by(|a, b| a.id == b.id);

        Ok(all_messages)
    }
}

/// Full message from Outlook (Graph API returns full data in list call)
#[derive(Debug)]
pub struct OutlookMessage {
    pub id: String,
    pub from_email: String,
    pub to_email: String,
    pub subject: String,
    pub body: String,
    pub html_body: Option<String>,
    pub sent_at: chrono::DateTime<chrono::Utc>,
}

fn extract_code_and_state_from_request(request_line: &str) -> Option<(String, String)> {
    let url_part = request_line.split_whitespace().nth(1)?;
    let url = url::Url::parse(&format!("http://localhost{}", url_part)).ok()?;

    let mut code = None;
    let mut state = None;
    for (key, value) in url.query_pairs() {
        if key == "code" {
            code = Some(value.to_string());
        }
        if key == "state" {
            state = Some(value.to_string());
        }
    }
    match (code, state) {
        (Some(c), Some(s)) => Some((c, s)),
        _ => None,
    }
}
