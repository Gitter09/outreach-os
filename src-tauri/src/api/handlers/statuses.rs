use crate::api::{
    error::{ApiError, ApiResponse},
    AppState,
};
use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;

pub async fn list_statuses(
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<Vec<jobdex_core::models::Status>>>, ApiError> {
    let statuses = sqlx::query_as::<_, jobdex_core::models::Status>(
        "SELECT id, label, color, position, is_default FROM statuses ORDER BY position ASC",
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(ApiResponse::ok(statuses)))
}

#[derive(Deserialize)]
pub struct CreateStatusBody {
    pub label: String,
    pub color: String,
}

pub async fn create_status(
    State(state): State<AppState>,
    Json(body): Json<CreateStatusBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO statuses (id, label, color, position) VALUES (?, ?, ?, (SELECT COUNT(*) FROM statuses))")
        .bind(&id)
        .bind(&body.label)
        .bind(&body.color)
        .execute(&state.pool)
        .await?;

    #[cfg(debug_assertions)]
    println!("[API] Created status {} '{}'", id, body.label);

    Ok(Json(ApiResponse::ok(serde_json::json!({ "id": id }))))
}

#[derive(Deserialize)]
pub struct UpdateStatusBody {
    pub label: Option<String>,
    pub color: Option<String>,
}

pub async fn update_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateStatusBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    sqlx::query("UPDATE statuses SET label = COALESCE(?, label), color = COALESCE(?, color), updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&body.label)
        .bind(&body.color)
        .bind(&id)
        .execute(&state.pool)
        .await?;

    Ok(Json(ApiResponse::ok(serde_json::json!({ "id": id }))))
}

pub async fn delete_status(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let mut tx = state.pool.begin().await?;
    sqlx::query("UPDATE contacts SET status_id = NULL WHERE status_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM statuses WHERE id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;

    #[cfg(debug_assertions)]
    println!("[API] Deleted status {}", id);

    Ok(Json(ApiResponse::ok(
        serde_json::json!({ "deleted": true }),
    )))
}

#[derive(Deserialize)]
pub struct ReorderBody {
    pub positions: Vec<StatusPosition>,
}

#[derive(Deserialize)]
pub struct StatusPosition {
    pub id: String,
    pub position: i32,
}

pub async fn reorder_statuses(
    State(state): State<AppState>,
    Json(body): Json<ReorderBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let mut tx = state.pool.begin().await?;
    for sp in body.positions {
        sqlx::query("UPDATE statuses SET position = ? WHERE id = ?")
            .bind(sp.position)
            .bind(&sp.id)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(Json(ApiResponse::ok(
        serde_json::json!({ "reordered": true }),
    )))
}
