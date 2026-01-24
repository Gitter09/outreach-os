use anyhow::{anyhow, Result};
use reqwest::Client;
use serde::Deserialize;
use serde_json::json;

/// Task type to determine which AI model to use
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AiTask {
    EmailDraft,
    SubjectLine,
    ProfileAnalysis,
    MagicPaste,
    Icebreakers,
}

/// Enum to select which AI provider to use
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AiProvider {
    Ollama,     // Local Llama 3.2
    OpenRouter, // Gemini 2.0 Flash via OpenRouter
}

/// Configuration for AI requests
#[derive(Debug, Clone)]
pub struct AiConfig {
    pub provider: AiProvider,
    pub ollama_model: String,
    pub openrouter_model: String,
    pub openrouter_base_url: String,
    pub openrouter_api_key: Option<String>,
    pub custom_draft_prompt: Option<String>,
    pub custom_subject_prompt: Option<String>,
}

impl Default for AiConfig {
    fn default() -> Self {
        Self {
            provider: AiProvider::Ollama,
            ollama_model: "llama3.2".to_string(),
            // Gemini 2.0 Flash Experimental via OpenRouter (free tier)
            openrouter_model: "google/gemini-2.0-flash-exp:free".to_string(),
            openrouter_base_url: "https://openrouter.ai/api/v1".to_string(),
            openrouter_api_key: None,
            custom_draft_prompt: None,
            custom_subject_prompt: None,
        }
    }
}

impl AiConfig {
    /// Factory for task-based configuration
    pub fn for_task(task: AiTask, api_key: Option<String>) -> Self {
        match task {
            // Complex tasks -> Gemini 2.0 Flash (Cloud)
            AiTask::EmailDraft | AiTask::SubjectLine | AiTask::ProfileAnalysis => Self {
                provider: AiProvider::OpenRouter,
                openrouter_api_key: api_key,
                ..Default::default()
            },
            // Simple/Privacy tasks -> Ollama (Local)
            AiTask::MagicPaste | AiTask::Icebreakers => Self::default(),
        }
    }
}

/// OpenRouter API response structure
#[derive(Debug, Deserialize)]
struct OpenRouterResponse {
    choices: Vec<OpenRouterChoice>,
    error: Option<OpenRouterError>, // Handle API errors
}

#[derive(Debug, Deserialize)]
struct OpenRouterError {
    message: String,
}

#[derive(Debug, Deserialize)]
struct OpenRouterChoice {
    message: OpenRouterMessage,
}

#[derive(Debug, Deserialize)]
struct OpenRouterMessage {
    content: String,
}

/// Ollama API response structure
#[derive(Debug, Deserialize)]
struct OllamaResponse {
    response: String,
}

pub struct AiClient {
    pub client: Client,
    pub config: AiConfig,
}

impl AiClient {
    pub fn new(config: AiConfig) -> Self {
        Self {
            client: Client::new(),
            config,
        }
    }

    /// Create with Ollama as default (legacy support)
    pub fn ollama_default() -> Self {
        Self::new(AiConfig::default())
    }

    /// Create with OpenRouter for enrichment (legacy support)
    pub fn openrouter(api_key: String) -> Self {
        Self::new(AiConfig {
            provider: AiProvider::OpenRouter,
            openrouter_api_key: Some(api_key),
            ..Default::default()
        })
    }

    /// Main entry point: generate a completion
    pub async fn generate(&self, prompt: &str) -> Result<String> {
        match self.config.provider {
            AiProvider::Ollama => self.call_ollama(prompt).await,
            AiProvider::OpenRouter => self.call_openrouter(prompt).await,
        }
    }

    /// Call local Ollama instance
    async fn call_ollama(&self, prompt: &str) -> Result<String> {
        let response = self
            .client
            .post("http://localhost:11434/api/generate")
            .timeout(std::time::Duration::from_secs(60))
            .json(&json!({
                "model": self.config.ollama_model,
                "prompt": prompt,
                "stream": false,
                "options": {
                    "temperature": 0.0,
                    "num_predict": 512, // Increased for larger context
                    "top_p": 0.9
                }
            }))
            .send()
            .await?;

        if response.status().is_success() {
            let body: OllamaResponse = response.json().await?;
            Ok(body.response)
        } else {
            Err(anyhow!("Ollama call failed: {}", response.status()))
        }
    }

    /// Call OpenRouter API (OpenAI-compatible)
    async fn call_openrouter(&self, prompt: &str) -> Result<String> {
        let api_key = self.config.openrouter_api_key.as_ref().ok_or_else(|| {
            anyhow!("OpenRouter API key not configured. Please set it in Settings > AI.")
        })?;

        let url = format!(
            "{}/chat/completions",
            self.config.openrouter_base_url.trim_end_matches('/')
        );

        let response = self
            .client
            .post(&url)
            .timeout(std::time::Duration::from_secs(60))
            .header("Authorization", format!("Bearer {}", api_key))
            // Required for OpenRouter to identify your app
            .header(
                "HTTP-Referer",
                "https://github.com/outreach-os/personal-crm",
            )
            .header("X-Title", "Personal CRM")
            .header("Content-Type", "application/json")
            .json(&json!({
                "model": self.config.openrouter_model,
                "messages": [
                    { "role": "user", "content": prompt }
                ]
            }))
            .send()
            .await?;

        if response.status().is_success() {
            let body: OpenRouterResponse = response.json().await?;

            if let Some(err) = body.error {
                return Err(anyhow!("OpenRouter API Error: {}", err.message));
            }

            body.choices
                .first()
                .map(|c| c.message.content.clone())
                .ok_or_else(|| anyhow!("No response content from OpenRouter"))
        } else {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            Err(anyhow!("OpenRouter call failed: {} - {}", status, text))
        }
    }
}
