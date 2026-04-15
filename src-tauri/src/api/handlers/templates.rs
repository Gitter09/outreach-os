use crate::api::{
    error::{ApiError, ApiResponse},
    AppState,
};
use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;

pub async fn list_templates(
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<Vec<serde_json::Value>>>, ApiError> {
    let templates = sqlx::query_as::<_, jobdex_core::models::EmailTemplate>(
        "SELECT id, name, subject, body, attachment_paths, created_at, updated_at FROM email_templates ORDER BY name ASC",
    )
    .fetch_all(&state.pool)
    .await?;

    let result: Vec<serde_json::Value> = templates
        .iter()
        .map(|t| {
            let paths: Vec<String> = serde_json::from_str(&t.attachment_paths).unwrap_or_default();
            serde_json::json!({
                "id": t.id,
                "name": t.name,
                "subject": t.subject,
                "body": t.body,
                "attachmentPaths": paths,
                "createdAt": t.created_at,
                "updatedAt": t.updated_at,
            })
        })
        .collect();

    Ok(Json(ApiResponse::ok(result)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertTemplateBody {
    pub id: Option<String>,
    pub name: String,
    pub subject: Option<String>,
    pub body: Option<String>,
}

pub async fn upsert_template(
    State(state): State<AppState>,
    Json(body): Json<UpsertTemplateBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let id = body.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    let paths_json = "[]";
    sqlx::query(
        r#"INSERT INTO email_templates (id, name, subject, body, attachment_paths, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            subject = excluded.subject,
            body = excluded.body,
            attachment_paths = excluded.attachment_paths,
            updated_at = CURRENT_TIMESTAMP"#,
    )
    .bind(&id)
    .bind(&body.name)
    .bind(&body.subject)
    .bind(&body.body)
    .bind(paths_json)
    .execute(&state.pool)
    .await?;
    Ok(Json(ApiResponse::ok(serde_json::json!({ "id": id }))))
}

pub async fn delete_template(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    sqlx::query("DELETE FROM email_templates WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;
    Ok(Json(ApiResponse::ok(
        serde_json::json!({ "deleted": true }),
    )))
}
