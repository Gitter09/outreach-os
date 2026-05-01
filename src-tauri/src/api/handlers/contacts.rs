use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashMap;

use crate::api::error::{ApiError, ApiResponse};
use crate::api::AppState;

/// Re-export the shared SQL query base from src-core.
const CONTACT_SELECT_BASE: &str = jobdex_core::contacts::CONTACT_SELECT_BASE;

#[derive(Debug, Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ContactWithTags {
    pub id: String,
    pub first_name: String,
    pub last_name: String,
    pub email: Option<String>,
    pub linkedin_url: Option<String>,
    pub title: Option<String>,
    pub company: Option<String>,
    pub location: Option<String>,
    pub company_website: Option<String>,
    pub status_id: Option<String>,
    pub status_label: Option<String>,
    pub status_color: Option<String>,
    #[serde(rename = "summary")]
    pub intelligence_summary: Option<String>,
    pub last_contacted_date: Option<chrono::DateTime<chrono::Utc>>,
    pub next_contact_date: Option<chrono::DateTime<chrono::Utc>>,
    pub effective_next_date: Option<chrono::DateTime<chrono::Utc>>,
    pub next_contact_event: Option<String>,
    pub cadence_stage: Option<i32>,
    pub created_at: chrono::DateTime<chrono::Utc>,
    pub updated_at: chrono::DateTime<chrono::Utc>,
    #[sqlx(skip)]
    pub tags: Vec<TagBrief>,
}

#[derive(Debug, Serialize, Clone, sqlx::FromRow)]
pub struct TagBrief {
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct TagAssignmentRow {
    pub contact_id: String,
    pub id: String,
    pub name: String,
    pub color: String,
}

#[derive(Deserialize)]
pub struct ListContactsQuery {
    pub status_id: Option<String>,
    pub tag: Option<String>,
    pub search: Option<String>,
}

pub async fn list_contacts(
    State(state): State<AppState>,
    Query(params): Query<ListContactsQuery>,
) -> Result<Json<ApiResponse<Vec<ContactWithTags>>>, ApiError> {
    let pool = &state.pool;

    let contacts: Vec<ContactWithTags> =
        if params.search.is_some() || params.status_id.is_some() || params.tag.is_some() {
            search_contacts_query(pool, &params.search, &params.status_id, &params.tag).await?
        } else {
            let sql = format!("{} ORDER BY c.updated_at DESC", CONTACT_SELECT_BASE);
            sqlx::query_as::<_, ContactWithTags>(&sql)
                .fetch_all(pool)
                .await?
        };

    let enriched = enrich_with_tags(pool, contacts).await?;
    Ok(Json(ApiResponse::ok(enriched)))
}

pub async fn get_contact(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<ContactWithTags>>, ApiError> {
    let pool = &state.pool;
    let sql = format!(
        "{} WHERE c.id = ? ORDER BY c.updated_at DESC",
        CONTACT_SELECT_BASE
    );
    let contact = sqlx::query_as::<_, ContactWithTags>(&sql)
        .bind(&id)
        .fetch_optional(pool)
        .await?
        .ok_or_else(|| ApiError::NotFound(format!("Contact '{}' not found", id)))?;

    let enriched = enrich_with_tags(pool, vec![contact]).await?;
    Ok(Json(ApiResponse::ok(enriched.into_iter().next().unwrap())))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateContactBody {
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

pub async fn create_contact(
    State(state): State<AppState>,
    Json(body): Json<CreateContactBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let pool = &state.pool;
    let id = uuid::Uuid::new_v4().to_string();

    let provided_status_id = body.status_id.filter(|s| !s.trim().is_empty());
    let final_status_id = if let Some(ref sid) = provided_status_id {
        let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM statuses WHERE id = ?)")
            .bind(sid)
            .fetch_one(pool)
            .await?;
        if !exists {
            return Err(ApiError::Validation(format!(
                "Status '{}' does not exist.",
                sid
            )));
        }
        sid.clone()
    } else {
        sqlx::query_scalar("SELECT id FROM statuses ORDER BY position ASC LIMIT 1")
            .fetch_optional(pool)
            .await?
            .ok_or_else(|| {
                ApiError::Validation("No statuses found. Create a status first.".into())
            })?
    };

    sqlx::query("INSERT INTO contacts (id, first_name, last_name, email, linkedin_url, status_id, title, company, location, company_website) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(&id)
        .bind(&body.first_name)
        .bind(&body.last_name)
        .bind(&body.email)
        .bind(&body.linkedin_url)
        .bind(&final_status_id)
        .bind(&body.title)
        .bind(&body.company)
        .bind(&body.location)
        .bind(&body.company_website)
        .execute(pool)
        .await?;

    #[cfg(debug_assertions)]
    println!("[API] Created contact {} '{} {}'", id, body.first_name, body.last_name);

    Ok(Json(ApiResponse::ok(serde_json::json!({ "id": id }))))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateContactBody {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub email: Option<String>,
    pub linkedin_url: Option<String>,
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

pub async fn update_contact(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateContactBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let pool = &state.pool;

    let exists: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM contacts WHERE id = ?)")
        .bind(&id)
        .fetch_one(pool)
        .await?;
    if !exists {
        return Err(ApiError::NotFound(format!("Contact '{}' not found", id)));
    }

    sqlx::query(
        r#"
        UPDATE contacts SET
            first_name = COALESCE(?, first_name),
            last_name = COALESCE(?, last_name),
            email = COALESCE(?, email),
            linkedin_url = COALESCE(?, linkedin_url),
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
    .bind(body.first_name)
    .bind(body.last_name)
    .bind(body.email)
    .bind(body.linkedin_url)
    .bind(&body.status_id)
    .bind(body.last_contacted_date)
    .bind(body.next_contact_date)
    .bind(body.cadence_stage)
    .bind(body.title)
    .bind(body.company)
    .bind(body.location)
    .bind(body.company_website)
    .bind(body.intelligence_summary)
    .bind(&id)
    .execute(pool)
    .await?;

    if let Some(ref sid) = body.status_id {
        let label: Option<String> = sqlx::query_scalar("SELECT label FROM statuses WHERE id = ?")
            .bind(sid)
            .fetch_optional(pool)
            .await
            .ok()
            .flatten();
        if let Some(ref lbl) = label {
            let event_id = uuid::Uuid::new_v4().to_string();
            let _ = sqlx::query(
                "INSERT INTO contact_events (id, contact_id, title, description, event_at, event_type) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'activity')",
            )
            .bind(&event_id)
            .bind(&id)
            .bind(format!("Moved to {}", lbl))
            .bind(Option::<String>::None)
            .execute(pool)
            .await;
        }
    }

    #[cfg(debug_assertions)]
    #[cfg(debug_assertions)]
    println!("[API] Updated contact {}", id);

    Ok(Json(ApiResponse::ok(serde_json::json!({ "id": id }))))
}

pub async fn delete_contact(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let pool = &state.pool;
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

    #[cfg(debug_assertions)]
    #[cfg(debug_assertions)]
    println!("[API] Deleted contact {}", id);

    Ok(Json(ApiResponse::ok(
        serde_json::json!({ "deleted": true }),
    )))
}

#[derive(Deserialize)]
pub struct BulkDeleteBody {
    pub ids: Vec<String>,
}

pub async fn bulk_delete_contacts(
    State(state): State<AppState>,
    Json(body): Json<BulkDeleteBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let pool = &state.pool;
    let mut tx = pool.begin().await?;
    let mut count: u64 = 0;

    for id in &body.ids {
        let result = sqlx::query("DELETE FROM contacts WHERE id = ?")
            .bind(id)
            .execute(&mut *tx)
            .await?;
        count += result.rows_affected();
    }

    tx.commit().await?;

    #[cfg(debug_assertions)]
    #[cfg(debug_assertions)]
    println!("[API] Bulk deleted {} contacts", count);

    Ok(Json(ApiResponse::ok(
        serde_json::json!({ "deleted": count }),
    )))
}

#[derive(Deserialize)]
pub struct BulkStatusBody {
    pub ids: Vec<String>,
    pub status_id: String,
}

pub async fn bulk_update_status(
    State(state): State<AppState>,
    Json(body): Json<BulkStatusBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let pool = &state.pool;
    let mut tx = pool.begin().await?;
    let mut count: u64 = 0;

    for id in &body.ids {
        let result = sqlx::query("UPDATE contacts SET status_id = ? WHERE id = ?")
            .bind(&body.status_id)
            .bind(id)
            .execute(&mut *tx)
            .await?;
        count += result.rows_affected();
    }

    tx.commit().await?;

    #[cfg(debug_assertions)]
    #[cfg(debug_assertions)]
    println!("[API] Bulk updated status for {} contacts", count);

    Ok(Json(ApiResponse::ok(
        serde_json::json!({ "updated": count }),
    )))
}

async fn search_contacts_query(
    pool: &SqlitePool,
    search: &Option<String>,
    status_id: &Option<String>,
    tag: &Option<String>,
) -> Result<Vec<ContactWithTags>, sqlx::Error> {
    let mut conditions = vec!["1=1".to_string()];
    let mut sql = format!("{} ", CONTACT_SELECT_BASE);

    if let Some(s) = search {
        if !s.is_empty() {
            conditions.push(format!(
                "(c.first_name LIKE '%{s}%' OR c.last_name LIKE '%{s}%' OR c.email LIKE '%{s}%' OR c.company LIKE '%{s}%' OR c.title LIKE '%{s}%')"
            ));
        }
    }

    if let Some(sid) = status_id {
        if !sid.is_empty() {
            conditions.push(format!("c.status_id = '{sid}'"));
        }
    }

    if let Some(t) = tag {
        if !t.is_empty() {
            sql = format!("{} LEFT JOIN contact_tags ct ON c.id = ct.contact_id LEFT JOIN tags tg ON ct.tag_id = tg.id ", CONTACT_SELECT_BASE);
            conditions.push(format!("tg.name = '{t}'"));
        }
    }

    let where_clause = conditions.join(" AND ");
    let full_sql = format!("{} WHERE {} ORDER BY c.updated_at DESC", sql, where_clause);

    sqlx::query_as::<_, ContactWithTags>(&full_sql)
        .fetch_all(pool)
        .await
}

pub async fn enrich_with_tags(
    pool: &SqlitePool,
    contacts: Vec<ContactWithTags>,
) -> Result<Vec<ContactWithTags>, ApiError> {
    let assignments = sqlx::query_as::<_, TagAssignmentRow>(
        "SELECT ct.contact_id, t.id, t.name, t.color FROM tags t JOIN contact_tags ct ON t.id = ct.tag_id",
    )
    .fetch_all(pool)
    .await?;

    let mut tags_by_contact: HashMap<String, Vec<TagBrief>> = HashMap::new();
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

    let result: Vec<ContactWithTags> = contacts
        .into_iter()
        .map(|mut c| {
            c.tags = tags_by_contact.remove(&c.id).unwrap_or_default();
            c
        })
        .collect();

    Ok(result)
}
