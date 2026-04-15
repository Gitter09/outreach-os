use crate::api::{
    error::{ApiError, ApiResponse},
    AppState,
};
use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;

pub async fn list_tags(
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<Vec<jobdex_core::models::Tag>>>, ApiError> {
    let tags = sqlx::query_as::<_, jobdex_core::models::Tag>(
        "SELECT id, name, color, created_at FROM tags ORDER BY name ASC",
    )
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(ApiResponse::ok(tags)))
}

#[derive(Deserialize)]
pub struct CreateTagBody {
    pub name: String,
    pub color: String,
}

pub async fn create_tag(
    State(state): State<AppState>,
    Json(body): Json<CreateTagBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let id = uuid::Uuid::new_v4().to_string();
    sqlx::query("INSERT INTO tags (id, name, color) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(&body.name)
        .bind(&body.color)
        .execute(&state.pool)
        .await?;
    Ok(Json(ApiResponse::ok(serde_json::json!({ "id": id }))))
}

#[derive(Deserialize)]
pub struct UpdateTagBody {
    pub name: Option<String>,
    pub color: Option<String>,
}

pub async fn update_tag(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateTagBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    sqlx::query(
        "UPDATE tags SET name = COALESCE(?, name), color = COALESCE(?, color) WHERE id = ?",
    )
    .bind(&body.name)
    .bind(&body.color)
    .bind(&id)
    .execute(&state.pool)
    .await?;
    Ok(Json(ApiResponse::ok(serde_json::json!({ "id": id }))))
}

pub async fn delete_tag(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    sqlx::query("DELETE FROM tags WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;
    Ok(Json(ApiResponse::ok(
        serde_json::json!({ "deleted": true }),
    )))
}

pub async fn assign_tag(
    State(state): State<AppState>,
    Path(ids): Path<(String, String)>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let (contact_id, tag_id) = ids;
    sqlx::query("INSERT OR IGNORE INTO contact_tags (contact_id, tag_id) VALUES (?, ?)")
        .bind(&contact_id)
        .bind(&tag_id)
        .execute(&state.pool)
        .await?;
    Ok(Json(ApiResponse::ok(
        serde_json::json!({ "assigned": true }),
    )))
}

pub async fn unassign_tag(
    State(state): State<AppState>,
    Path(ids): Path<(String, String)>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let (contact_id, tag_id) = ids;
    sqlx::query("DELETE FROM contact_tags WHERE contact_id = ? AND tag_id = ?")
        .bind(&contact_id)
        .bind(&tag_id)
        .execute(&state.pool)
        .await?;
    Ok(Json(ApiResponse::ok(
        serde_json::json!({ "unassigned": true }),
    )))
}
