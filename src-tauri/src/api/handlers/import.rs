use crate::api::error::{ApiError, ApiResponse};
use axum::Json;
use serde::Deserialize;

pub async fn get_headers(
    Json(body): Json<GetHeadersBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    if body.file_path.contains("..") {
        return Err(ApiError::Validation(
            "Invalid file path: path traversal not allowed".into(),
        ));
    }
    match jobdex_core::import::preview_file(&body.file_path) {
        Ok(preview) => Ok(Json(ApiResponse::ok(
            serde_json::to_value(preview).map_err(|e| ApiError::Internal(e.to_string()))?,
        ))),
        Err(e) => Err(ApiError::Internal(e.to_string())),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzeBody {
    pub file_path: String,
    #[allow(dead_code)]
    pub mapping: jobdex_core::import::ColumnMapping,
}

pub async fn analyze(
    Json(body): Json<AnalyzeBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    if body.file_path.contains("..") {
        return Err(ApiError::Validation(
            "Invalid file path: path traversal not allowed".into(),
        ));
    }
    Err(ApiError::Internal(
        "Import via API not yet fully implemented".into(),
    ))
}

pub async fn import_contacts(
    _body: Json<serde_json::Value>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    Err(ApiError::Internal(
        "Import via API not yet fully implemented".into(),
    ))
}

#[derive(Deserialize)]
pub struct GetHeadersBody {
    pub file_path: String,
}
