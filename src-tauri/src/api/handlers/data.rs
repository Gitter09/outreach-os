use crate::api::{
    error::{ApiError, ApiResponse},
    AppState,
};
use axum::{extract::State, Json};

pub async fn export_data(
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let pool = &state.pool;
    let contacts = sqlx::query_as::<_, jobdex_core::models::Contact>(
        r#"SELECT c.id, c.first_name, c.last_name, c.email, c.linkedin_url,
           c.title, c.company, c.location, c.company_website, c.status_id,
           s.label as status_label, s.color as status_color,
           c.intelligence_summary, c.last_interaction_at, c.last_contacted_date,
           c.next_contact_date, NULL as effective_next_date, c.next_contact_event,
           c.cadence_stage, c.created_at, c.updated_at
           FROM contacts c LEFT JOIN statuses s ON c.status_id = s.id"#,
    )
    .fetch_all(pool)
    .await?;

    let statuses = sqlx::query_as::<_, jobdex_core::models::Status>(
        "SELECT id, label, color, position, is_default FROM statuses",
    )
    .fetch_all(pool)
    .await?;

    let tags = sqlx::query_as::<_, jobdex_core::models::Tag>(
        "SELECT id, name, color, created_at FROM tags",
    )
    .fetch_all(pool)
    .await?;

    let export = serde_json::json!({
        "version": "1.2",
        "exportedAt": chrono::Utc::now().to_rfc3339(),
        "contacts": contacts,
        "statuses": statuses,
        "tags": tags,
    });

    Ok(Json(ApiResponse::ok(export)))
}

pub async fn clear_data(
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let pool = &state.pool;
    let mut tx = pool.begin().await?;

    sqlx::query("DELETE FROM contact_events")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM contact_files")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM contact_tags")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM email_attachments")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM email_messages")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM email_threads")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM scheduled_emails")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM email_accounts")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM contacts")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM statuses")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM tags").execute(&mut *tx).await?;
    sqlx::query("DELETE FROM email_templates")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM email_signatures")
        .execute(&mut *tx)
        .await?;

    tx.commit().await?;

    #[cfg(debug_assertions)]
    println!("[API] All data cleared");

    Ok(Json(ApiResponse::ok(
        serde_json::json!({ "cleared": true }),
    )))
}
