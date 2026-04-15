use crate::api::{
    error::{ApiError, ApiResponse},
    AppState,
};
use axum::{extract::State, Json};
use serde::Deserialize;
use std::collections::HashMap;

pub async fn get_settings(
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<HashMap<String, String>>>, ApiError> {
    let manager = jobdex_core::settings::SettingsManager::new(state.pool.clone());
    let settings = manager
        .get_all()
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    Ok(Json(ApiResponse::ok(settings)))
}

#[derive(Deserialize)]
pub struct UpdateSettingsBody {
    pub settings: HashMap<String, String>,
}

pub async fn update_settings(
    State(state): State<AppState>,
    Json(body): Json<UpdateSettingsBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let manager = jobdex_core::settings::SettingsManager::new(state.pool.clone());
    for (key, value) in &body.settings {
        manager
            .set(key, value)
            .await
            .map_err(|e| ApiError::Internal(e.to_string()))?;
    }
    Ok(Json(ApiResponse::ok(
        serde_json::json!({ "updated": true }),
    )))
}
