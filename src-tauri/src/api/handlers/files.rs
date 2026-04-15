use crate::api::{
    error::{ApiError, ApiResponse},
    AppState,
};
use axum::{
    extract::{Path, State},
    Json,
};

#[derive(Debug, serde::Serialize, serde::Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ContactFileRow {
    id: String,
    contact_id: String,
    filename: String,
    file_path: String,
    created_at: chrono::DateTime<chrono::Utc>,
}

pub async fn list_files(
    State(state): State<AppState>,
    Path(contact_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<ContactFileRow>>>, ApiError> {
    let rows = sqlx::query_as::<_, ContactFileRow>(
        "SELECT id, contact_id, filename, file_path, created_at FROM contact_files WHERE contact_id = ? ORDER BY created_at ASC",
    )
    .bind(&contact_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(ApiResponse::ok(rows)))
}

pub async fn delete_file(
    State(state): State<AppState>,
    Path(ids): Path<(String, String)>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let (_contact_id, file_id) = ids;

    let row = sqlx::query_as::<_, ContactFileRow>(
        "SELECT id, contact_id, filename, file_path, created_at FROM contact_files WHERE id = ?",
    )
    .bind(&file_id)
    .fetch_optional(&state.pool)
    .await?;

    if let Some(r) = row {
        let _ = std::fs::remove_file(&r.file_path);
    }

    sqlx::query("DELETE FROM contact_files WHERE id = ?")
        .bind(&file_id)
        .execute(&state.pool)
        .await?;

    Ok(Json(ApiResponse::ok(
        serde_json::json!({ "deleted": true }),
    )))
}
