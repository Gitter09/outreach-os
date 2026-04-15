use super::contacts::{ContactWithTags, TagAssignmentRow, TagBrief};
use crate::api::{
    error::{ApiError, ApiResponse},
    AppState,
};
use axum::{
    extract::{Query, State},
    Json,
};
use serde::{Deserialize, Serialize};

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
}

#[derive(Serialize)]
pub struct SearchResults {
    pub contacts: Vec<ContactWithTags>,
    pub tags: Vec<jobdex_core::models::Tag>,
}

pub async fn search(
    State(state): State<AppState>,
    Query(params): Query<SearchQuery>,
) -> Result<Json<ApiResponse<SearchResults>>, ApiError> {
    let pool = &state.pool;

    let contacts = if let Some(ref q) = params.q {
        if q.is_empty() {
            vec![]
        } else {
            let pattern = format!("%{}%", q);
            let mut contacts: Vec<ContactWithTags> = sqlx::query_as::<_, ContactWithTags>(
                r#"SELECT c.id, c.first_name, c.last_name, c.email, c.linkedin_url,
                   c.title, c.company, c.location, c.company_website, c.status_id,
                   s.label AS status_label, s.color AS status_color,
                   c.intelligence_summary, c.last_contacted_date,
                   c.next_contact_date, c.effective_next_date, c.next_contact_event,
                   c.cadence_stage, c.created_at, c.updated_at
                   FROM contacts c
                   LEFT JOIN statuses s ON c.status_id = s.id
                   WHERE c.first_name LIKE ? OR c.last_name LIKE ? OR c.email LIKE ? OR c.company LIKE ? OR c.title LIKE ?
                   ORDER BY c.updated_at DESC"#,
            )
            .bind(&pattern)
            .bind(&pattern)
            .bind(&pattern)
            .bind(&pattern)
            .bind(&pattern)
            .fetch_all(pool)
            .await?;

            let assignments = sqlx::query_as::<_, TagAssignmentRow>(
                "SELECT ct.contact_id, t.id, t.name, t.color FROM tags t JOIN contact_tags ct ON t.id = ct.tag_id",
            )
            .fetch_all(pool)
            .await?;

            let mut tags_by_contact: std::collections::HashMap<String, Vec<TagBrief>> =
                std::collections::HashMap::new();
            for a in assignments {
                tags_by_contact
                    .entry(a.contact_id)
                    .or_default()
                    .push(TagBrief {
                        id: a.id,
                        name: a.name,
                        color: a.color,
                    });
            }

            for c in &mut contacts {
                c.tags = tags_by_contact.remove(&c.id).unwrap_or_default();
            }

            contacts
        }
    } else {
        vec![]
    };

    let tags = if let Some(ref q) = params.q {
        if q.is_empty() {
            vec![]
        } else {
            let pattern = format!("%{}%", q);
            sqlx::query_as::<_, jobdex_core::models::Tag>(
                "SELECT id, name, color, created_at FROM tags WHERE name LIKE ?",
            )
            .bind(&pattern)
            .fetch_all(pool)
            .await?
        }
    } else {
        vec![]
    };

    Ok(Json(ApiResponse::ok(SearchResults { contacts, tags })))
}

#[derive(Serialize)]
pub struct PipelineSummaryItem {
    pub status_id: String,
    pub label: String,
    pub color: String,
    pub count: i64,
}

pub async fn pipeline_summary(
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<Vec<PipelineSummaryItem>>>, ApiError> {
    let rows = sqlx::query_as::<_, (String, String, String, i64)>(
        r#"SELECT s.id, s.label, s.color, COUNT(c.id) as count
           FROM statuses s
           LEFT JOIN contacts c ON c.status_id = s.id
           GROUP BY s.id, s.label, s.color
           ORDER BY s.position ASC"#,
    )
    .fetch_all(&state.pool)
    .await?;

    let summary: Vec<PipelineSummaryItem> = rows
        .into_iter()
        .map(|(status_id, label, color, count)| PipelineSummaryItem {
            status_id,
            label,
            color,
            count,
        })
        .collect();

    Ok(Json(ApiResponse::ok(summary)))
}

pub async fn overdue_followups(
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<Vec<ContactWithTags>>>, ApiError> {
    let pool = &state.pool;

    let contacts: Vec<ContactWithTags> = sqlx::query_as::<_, ContactWithTags>(
        r#"SELECT c.id, c.first_name, c.last_name, c.email, c.linkedin_url,
           c.title, c.company, c.location, c.company_website, c.status_id,
           s.label AS status_label, s.color AS status_color,
           c.intelligence_summary, c.last_contacted_date,
           c.next_contact_date, c.effective_next_date, c.next_contact_event,
           c.cadence_stage, c.created_at, c.updated_at
           FROM contacts c
           LEFT JOIN statuses s ON c.status_id = s.id
           WHERE c.next_contact_date IS NOT NULL AND datetime(c.next_contact_date) <= CURRENT_TIMESTAMP
           ORDER BY c.next_contact_date ASC"#,
    )
    .fetch_all(pool)
    .await?;

    let enriched = super::contacts::enrich_with_tags(pool, contacts).await?;
    Ok(Json(ApiResponse::ok(enriched)))
}
