use crate::api::{
    error::{ApiError, ApiResponse},
    AppState,
};
use axum::{
    extract::{Path, State},
    Json,
};
use serde::Deserialize;

pub async fn list_events(
    State(state): State<AppState>,
    Path(contact_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<jobdex_core::models::ContactEvent>>>, ApiError> {
    let events = sqlx::query_as::<_, jobdex_core::models::ContactEvent>(
        "SELECT id, contact_id, title, description, event_at, created_at, updated_at FROM contact_events WHERE contact_id = ? AND event_type = 'user_event' ORDER BY event_at ASC",
    )
    .bind(&contact_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(ApiResponse::ok(events)))
}

pub async fn get_activity(
    State(state): State<AppState>,
    Path(contact_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<jobdex_core::models::ContactEvent>>>, ApiError> {
    let events = sqlx::query_as::<_, jobdex_core::models::ContactEvent>(
        "SELECT id, contact_id, title, description, event_at, created_at, updated_at FROM contact_events WHERE contact_id = ? AND event_type = 'activity' ORDER BY event_at DESC",
    )
    .bind(&contact_id)
    .fetch_all(&state.pool)
    .await?;
    Ok(Json(ApiResponse::ok(events)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateEventBody {
    pub title: String,
    pub description: Option<String>,
    pub event_at: Option<chrono::DateTime<chrono::Utc>>,
    pub event_type: Option<String>,
}

pub async fn create_event(
    State(state): State<AppState>,
    Path(contact_id): Path<String>,
    Json(body): Json<CreateEventBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let event_type = body.event_type.unwrap_or_else(|| "user_event".to_string());
    let event_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO contact_events (id, contact_id, title, description, event_at, event_type) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&event_id)
    .bind(&contact_id)
    .bind(&body.title)
    .bind(&body.description)
    .bind(body.event_at)
    .bind(&event_type)
    .execute(&state.pool)
    .await?;
    Ok(Json(ApiResponse::ok(serde_json::json!({ "id": event_id }))))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateEventBody {
    pub title: Option<String>,
    pub description: Option<String>,
    pub event_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub async fn update_event(
    State(state): State<AppState>,
    Path(ids): Path<(String, String)>,
    Json(body): Json<UpdateEventBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let (_contact_id, event_id) = ids;
    sqlx::query(
        "UPDATE contact_events SET title = COALESCE(?, title), description = COALESCE(?, description), event_at = COALESCE(?, event_at), updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    )
    .bind(&body.title)
    .bind(&body.description)
    .bind(body.event_at)
    .bind(&event_id)
    .execute(&state.pool)
    .await?;
    Ok(Json(ApiResponse::ok(serde_json::json!({ "id": event_id }))))
}

pub async fn delete_event(
    State(state): State<AppState>,
    Path(ids): Path<(String, String)>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let (_contact_id, event_id) = ids;
    sqlx::query("DELETE FROM contact_events WHERE id = ?")
        .bind(&event_id)
        .execute(&state.pool)
        .await?;
    Ok(Json(ApiResponse::ok(
        serde_json::json!({ "deleted": true }),
    )))
}
