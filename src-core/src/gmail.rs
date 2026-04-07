use anyhow::{anyhow, Result};
use base64::prelude::*;
use mail_parser::MimeHeaders;
use oauth2::{
    basic::BasicClient, AuthUrl, ClientId, ClientSecret, CsrfToken, PkceCodeChallenge,
    PkceCodeVerifier, RedirectUrl, Scope, TokenUrl,
};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;

const GOOGLE_AUTH_URL: &str = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL: &str = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPES: &[&str] = &[
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/userinfo.email",
];

// Centralized OAuth Defaults
// To be replaced with actual Client ID/Secret from Google Cloud Console
const DEFAULT_GMAIL_CLIENT_ID: &str = match option_env!("GMAIL_CLIENT_ID") {
    Some(id) => id,
    None => "PLACEHOLDER_GMAIL_CLIENT_ID",
};
const DEFAULT_GMAIL_CLIENT_SECRET: &str = match option_env!("GMAIL_CLIENT_SECRET") {
    Some(secret) => secret,
    None => "PLACEHOLDER_GMAIL_CLIENT_SECRET",
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

pub struct GmailClient {
    http_client: Client,
}

impl Default for GmailClient {
    fn default() -> Self {
        Self::new()
    }
}

impl GmailClient {
    pub fn new() -> Self {
        Self {
            http_client: Client::new(),
        }
    }

    fn load_credentials(&self) -> Result<(String, String)> {
        // Try to load from keychain first (user override)
        let client_id = crate::crypto::get_credential("gmail", "client_id")
            .unwrap_or_else(|_| DEFAULT_GMAIL_CLIENT_ID.to_string());

        let client_secret = crate::crypto::get_credential("gmail", "client_secret")
            .unwrap_or_else(|_| DEFAULT_GMAIL_CLIENT_SECRET.to_string());

        if client_id == "PLACEHOLDER_GMAIL_CLIENT_ID"
            || client_secret == "PLACEHOLDER_GMAIL_CLIENT_SECRET"
        {
            return Err(anyhow!("Gmail credentials not configured. Standard login is currently disabled while in beta."));
        }

        Ok((client_id, client_secret))
    }

    /// Starts the OAuth flow. Returns (auth_url, pkce_verifier, csrf_token).
    /// The `port` parameter specifies the local redirect port (use 0 for ephemeral).
    pub fn get_auth_url(&self, port: u16) -> Result<(String, PkceCodeVerifier, CsrfToken)> {
        let (client_id, client_secret) = self.load_credentials()?;

        let redirect_url = format!("http://127.0.0.1:{}", port);

        let client = BasicClient::new(ClientId::new(client_id))
            .set_client_secret(ClientSecret::new(client_secret))
            .set_auth_uri(AuthUrl::new(GOOGLE_AUTH_URL.to_string())?)
            .set_token_uri(TokenUrl::new(GOOGLE_TOKEN_URL.to_string())?)
            .set_redirect_uri(RedirectUrl::new(redirect_url)?);

        let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

        let mut auth_req = client
            .authorize_url(CsrfToken::new_random)
            .set_pkce_challenge(pkce_challenge);

        for scope in GOOGLE_SCOPES {
            auth_req = auth_req.add_scope(Scope::new(scope.to_string()));
        }

        // Request offline access to get refresh token
        auth_req = auth_req.add_extra_param("access_type", "offline");
        auth_req = auth_req.add_extra_param("prompt", "consent");

        let (auth_url, csrf_token) = auth_req.url();

        Ok((auth_url.to_string(), pkce_verifier, csrf_token))
    }

    /// Waits for the OAuth callback on a pre-bound listener and extracts the authorization code.
    /// Validates the CSRF `state` parameter against the expected token.
    pub fn wait_for_callback(
        &self,
        listener: TcpListener,
        expected_csrf: &CsrfToken,
    ) -> Result<String> {
        println!("Waiting for OAuth callback...");

        for mut stream in listener.incoming().flatten() {
            let mut reader = BufReader::new(&stream);
            let mut request_line = String::new();
            reader.read_line(&mut request_line)?;

            // Extract code and state from: GET /?code=XXX&state=YYY&scope=... HTTP/1.1
            if let Some((code, state)) = extract_code_and_state_from_request(&request_line) {
                // Validate CSRF state token
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

                // Send success response
                let html = crate::oauth_html::get_success_html("Google");
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
        let redirect_url = format!("http://127.0.0.1:{}", port);

        let params = [
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("code", code.as_str()),
            ("code_verifier", pkce_verifier.secret()),
            ("grant_type", "authorization_code"),
            ("redirect_uri", redirect_url.as_str()),
        ];

        let response = self
            .http_client
            .post(GOOGLE_TOKEN_URL)
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow!("Token exchange failed: {}", error_text));
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

        let params = [
            ("client_id", client_id.as_str()),
            ("client_secret", client_secret.as_str()),
            ("refresh_token", refresh_token),
            ("grant_type", "refresh_token"),
        ];

        let response = self
            .http_client
            .post(GOOGLE_TOKEN_URL)
            .form(&params)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow!("Token refresh failed: {}", error_text));
        }

        let token_response: FullTokenResponse = response.json().await?;

        Ok(OAuthTokenResponse {
            access_token: token_response.access_token,
            refresh_token: token_response
                .refresh_token
                .or(Some(refresh_token.to_string())), // Keep old refresh token if new one not provided
            expires_in: token_response.expires_in,
        })
    }

    /// Get user profile (email)
    pub async fn get_user_profile(&self, access_token: &str) -> Result<String> {
        let response = self
            .http_client
            .get("https://www.googleapis.com/oauth2/v2/userinfo")
            .bearer_auth(access_token)
            .send()
            .await?;

        if response.status().is_success() {
            let json: serde_json::Value = response.json().await?;
            let email = json["email"]
                .as_str()
                .ok_or_else(|| anyhow!("Email field missing in user info"))?;
            Ok(email.to_string())
        } else {
            let error = response.text().await?;
            Err(anyhow!("Failed to fetch user profile: {}", error))
        }
    }

    /// Sends an email via Gmail API
    pub async fn send_email(
        &self,
        access_token: &str,
        to: &str,
        subject: &str,
        body: &str,
        attachments: &[crate::email_service::OutgoingAttachment],
    ) -> Result<String> {
        // Build RFC 2822 message — HTML if no attachments, multipart/mixed otherwise
        let raw_message = if attachments.is_empty() {
            format!(
                "MIME-Version: 1.0\r\nTo: {}\r\nSubject: {}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n{}",
                to, subject, body
            )
        } else {
            let boundary = "==_JobDex_Boundary_==";
            let mut msg = format!(
                "MIME-Version: 1.0\r\nTo: {to}\r\nSubject: {subject}\r\nContent-Type: multipart/mixed; boundary=\"{boundary}\"\r\n\r\n"
            );
            // HTML part
            msg.push_str(&format!(
                "--{boundary}\r\nContent-Type: text/html; charset=utf-8\r\n\r\n{body}\r\n"
            ));
            // Attachment parts
            for att in attachments {
                let file_bytes = tokio::fs::read(&att.path).await?;
                let b64 = BASE64_STANDARD.encode(&file_bytes);
                // RFC 2045 §6.8: wrap at 76 chars
                let chunked = b64
                    .as_bytes()
                    .chunks(76)
                    .map(|c| std::str::from_utf8(c).unwrap())
                    .collect::<Vec<_>>()
                    .join("\r\n");
                msg.push_str(&format!(
                    "--{boundary}\r\nContent-Type: {mime}; name=\"{name}\"\r\nContent-Disposition: attachment; filename=\"{name}\"\r\nContent-Transfer-Encoding: base64\r\n\r\n{chunked}\r\n",
                    mime = att.mime_type,
                    name = att.filename,
                ));
            }
            msg.push_str(&format!("--{boundary}--\r\n"));
            msg
        };

        // Outer encoding is URL-safe no-pad (Gmail API requirement)
        let encoded = BASE64_URL_SAFE_NO_PAD.encode(raw_message.as_bytes());

        let request_body = serde_json::json!({
            "raw": encoded
        });

        let response = self
            .http_client
            .post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
            .bearer_auth(access_token)
            .json(&request_body)
            .send()
            .await?;

        if response.status().is_success() {
            let result: serde_json::Value = response.json().await?;
            Ok(result["id"].as_str().unwrap_or("sent").to_string())
        } else {
            let error: serde_json::Value = response.json().await?;
            Err(anyhow!("Gmail API error: {:?}", error))
        }
    }

    /// List message IDs from Gmail (inbox + sent), filtered by CRM contacts and timestamp
    pub async fn list_messages(
        &self,
        access_token: &str,
        contact_emails: &[String],
        after_timestamp: Option<i64>,
        max_results: u32,
    ) -> Result<Vec<GmailMessageStub>> {
        if contact_emails.is_empty() {
            return Ok(Vec::new());
        }

        // Build search query: (from:e1 OR to:e1 OR from:e2 OR to:e2 ...) after:{ts}
        // Partition contact emails to avoid hitting URL length limits
        let mut all_stubs = Vec::new();
        let chunks = contact_emails.chunks(50); // Use 50 contacts per batch

        for chunk in chunks {
            let mut or_parts = Vec::new();
            for email in chunk {
                or_parts.push(format!("from:{}", email));
                or_parts.push(format!("to:{}", email));
            }

            let filter_str = format!("({})", or_parts.join(" OR "));
            let query = match after_timestamp {
                Some(ts) => format!("{} after:{}", filter_str, ts),
                None => filter_str,
            };

            let url = format!(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages?q={}&maxResults={}",
                urlencoding::encode(&query),
                max_results
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
                return Err(anyhow!("Gmail list_messages error: {}", error_text));
            }

            let json: serde_json::Value = response.json().await?;
            if let Some(messages) = json["messages"].as_array() {
                for m in messages {
                    if let (Some(id), Some(thread_id)) = (m["id"].as_str(), m["threadId"].as_str())
                    {
                        all_stubs.push(GmailMessageStub {
                            id: id.to_string(),
                            thread_id: thread_id.to_string(),
                        });
                    }
                }
            }
        }

        // Deduplicate stubs (if any overlap between chunks)
        all_stubs.sort_by(|a, b| a.id.cmp(&b.id));
        all_stubs.dedup_by(|a, b| a.id == b.id);

        // Truncate to max_results if needed
        if all_stubs.len() > max_results as usize {
            all_stubs.truncate(max_results as usize);
        }

        Ok(all_stubs)
    }

    /// Fetch full message details by ID
    pub async fn get_message(&self, access_token: &str, message_id: &str) -> Result<GmailMessage> {
        let url = format!(
            "https://gmail.googleapis.com/gmail/v1/users/me/messages/{}?format=raw",
            message_id
        );

        let response = self
            .http_client
            .get(&url)
            .bearer_auth(access_token)
            .send()
            .await?;

        if !response.status().is_success() {
            let error_text = response.text().await?;
            return Err(anyhow!("Gmail get_message error: {}", error_text));
        }

        let json: serde_json::Value = response.json().await?;
        let raw_b64 = json["raw"]
            .as_str()
            .ok_or_else(|| anyhow!("Missing raw field in Gmail message {}", message_id))?;
        let raw_bytes = BASE64_URL_SAFE_NO_PAD.decode(raw_b64.trim_end_matches('='))?;

        let message = mail_parser::MessageParser::default()
            .parse(&raw_bytes)
            .ok_or_else(|| anyhow!("Failed to parse email message {}", message_id))?;

        let from_email = message
            .from()
            .and_then(|a| a.first())
            .and_then(|a| a.address.as_deref())
            .unwrap_or("")
            .to_string();

        let to_email = message
            .to()
            .and_then(|a| a.first())
            .and_then(|a| a.address.as_deref())
            .unwrap_or("")
            .to_string();

        let subject = message.subject().unwrap_or("").to_string();

        let sent_at = message
            .date()
            .and_then(|d| chrono::DateTime::<chrono::Utc>::from_timestamp_secs(d.to_timestamp()))
            .unwrap_or_else(chrono::Utc::now);

        let body = message
            .body_text(0)
            .map(|t| t.to_string())
            .unwrap_or_default();
        let html_body = message.body_html(0).map(|t| t.to_string());

        let mut attachments = Vec::new();
        for attachment in message.attachments() {
            let filename = attachment
                .attachment_name()
                .unwrap_or("attachment")
                .to_string();
            let content_type = attachment
                .content_type()
                .map(|ct: &mail_parser::ContentType| {
                    let sub = ct.subtype().unwrap_or("octet-stream");
                    format!("{}/{}", ct.ctype(), sub)
                })
                .unwrap_or_else(|| "application/octet-stream".to_string());
            let data = match &attachment.body {
                mail_parser::PartType::Binary(bytes)
                | mail_parser::PartType::InlineBinary(bytes) => bytes.as_ref().to_vec(),
                mail_parser::PartType::Text(text) => text.as_bytes().to_vec(),
                _ => continue,
            };
            if !data.is_empty() {
                attachments.push(RawAttachment {
                    filename,
                    content_type,
                    data,
                });
            }
        }

        Ok(GmailMessage {
            id: json["id"].as_str().unwrap_or(message_id).to_string(),
            from_email,
            to_email,
            subject,
            body,
            html_body,
            sent_at,
            attachments,
        })
    }
}

/// Stub returned from list_messages (just IDs)
#[derive(Debug)]
pub struct GmailMessageStub {
    pub id: String,
    pub thread_id: String,
}

/// Full message returned from get_message
#[derive(Debug)]
pub struct GmailMessage {
    pub id: String,
    pub from_email: String,
    pub to_email: String,
    pub subject: String,
    pub body: String,
    pub html_body: Option<String>,
    pub sent_at: chrono::DateTime<chrono::Utc>,
    pub attachments: Vec<RawAttachment>,
}

/// A raw attachment extracted from a MIME message before it is written to disk.
#[derive(Debug)]
pub struct RawAttachment {
    pub filename: String,
    pub content_type: String,
    pub data: Vec<u8>,
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
