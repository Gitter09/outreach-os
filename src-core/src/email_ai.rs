use crate::ai::{AiClient, AiConfig};
use crate::db::models::Contact;
use anyhow::Result;
use regex::Regex;

pub struct EmailAI {
    client: AiClient,
}

impl EmailAI {
    pub fn new(config: AiConfig) -> Self {
        Self {
            client: AiClient::new(config),
        }
    }

    pub async fn draft_email(&self, contact: &Contact) -> Result<String> {
        let prompt = self.build_draft_prompt(contact);
        self.client.generate(&prompt).await
    }

    pub async fn generate_subject_lines(&self, contact: &Contact) -> Result<Vec<String>> {
        let prompt = self.build_subject_prompt(contact);
        let response = self.client.generate(&prompt).await?;
        Ok(self.parse_subject_lines(&response))
    }

    fn build_draft_prompt(&self, contact: &Contact) -> String {
        let hooks = contact.ai_talking_points.as_deref().unwrap_or("");
        let company_intel = contact.ai_company_intel.as_deref().unwrap_or("");
        let summary = contact
            .intelligence_summary
            .as_deref()
            .unwrap_or("No summary available");

        if let Some(template) = &self.client.config.custom_draft_prompt {
            if !template.trim().is_empty() {
                return template
                    .replace("{{first_name}}", &contact.first_name)
                    .replace("{{last_name}}", &contact.last_name)
                    .replace(
                        "{{company}}",
                        contact.company.as_deref().unwrap_or("your company"),
                    )
                    .replace("{{summary}}", summary)
                    .replace("{{intel}}", company_intel)
                    .replace("{{talking_points}}", hooks);
            }
        }

        format!(
            "Write a professional cold outreach email to {first_name} {last_name}, \
            {title} at {company}.\n\n\
            Context:\n\
            - LinkedIn Summary: {summary}\n\
            - Company Intel: {company_intel}\n\
            - Key Talking Points: {hooks}\n\n\
            Requirements:\n\
            - Personal and warm tone\n\
            - Under 100 words\n\
            - Focus on mutual value\n\
            - End with a clear call-to-action (meeting request)\n\
            - No generic templates\n\
            - Do NOT include subject line, just body",
            first_name = contact.first_name,
            last_name = contact.last_name,
            title = contact.title.as_deref().unwrap_or("Professional"),
            company = contact.company.as_deref().unwrap_or("their company"),
            summary = summary,
            company_intel = company_intel,
            hooks = hooks
        )
    }

    fn build_subject_prompt(&self, contact: &Contact) -> String {
        if let Some(template) = &self.client.config.custom_subject_prompt {
            if !template.trim().is_empty() {
                return template
                    .replace("{{first_name}}", &contact.first_name)
                    .replace(
                        "{{company}}",
                        contact.company.as_deref().unwrap_or("your company"),
                    );
            }
        }

        format!(
            "Generate 3 compelling email subject lines for a VC reaching out to {first_name} at {company}.\n\
            Make them:\n\
            - Personal (mention their name or company)\n\
            - Under 60 characters\n\
            - Action-oriented\n\
            - Return ONLY the lines, one per line, no numbering or quotes.",
            first_name = contact.first_name,
            company = contact.company.as_deref().unwrap_or("their company")
        )
    }

    fn parse_subject_lines(&self, response: &str) -> Vec<String> {
        response
            .lines()
            .map(|line| {
                // Clean up numbering (1., 2.) and quotes
                let re = Regex::new(r"^[\d\.\-\s]+").unwrap();
                let cleaned = re.replace(line, "").to_string();
                cleaned.trim().replace("\"", "").to_string()
            })
            .filter(|line| !line.is_empty())
            .take(3)
            .collect()
    }
}
