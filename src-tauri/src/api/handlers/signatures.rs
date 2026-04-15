use crate::api::{
    error::{ApiError, ApiResponse},
    AppState,
};
use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct EmailSignatureRow {
    id: String,
    name: String,
    content: String,
    created_at: chrono::DateTime<chrono::Utc>,
    updated_at: chrono::DateTime<chrono::Utc>,
}

pub async fn list_signatures(
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<Vec<EmailSignatureRow>>>, ApiError> {
    let rows = sqlx::query_as::<_, EmailSignatureRow>(
        "SELECT id, name, content, created_at, updated_at FROM email_signatures ORDER BY name ASC",
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(ApiResponse::ok(rows)))
}

#[derive(Deserialize)]
pub struct UpsertSignatureBody {
    pub id: Option<String>,
    pub name: String,
    pub content: String,
}

pub async fn upsert_signature(
    State(state): State<AppState>,
    Json(body): Json<UpsertSignatureBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let sig_id = body.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    sqlx::query(
        "INSERT INTO email_signatures (id, name, content) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, content = excluded.content",
    )
    .bind(&sig_id)
    .bind(&body.name)
    .bind(&body.content)
    .execute(&state.pool)
    .await?;
    Ok(Json(ApiResponse::ok(serde_json::json!({ "id": sig_id }))))
}

pub async fn delete_signature(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    sqlx::query("DELETE FROM email_signatures WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;
    Ok(Json(ApiResponse::ok(
        serde_json::json!({ "deleted": true }),
    )))
}
