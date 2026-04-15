use crate::api::AppState;
use axum::{
    extract::Request, extract::State, http::StatusCode, middleware::Next, response::Response,
};

pub async fn auth_middleware(
    State(state): State<AppState>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    let enabled = get_api_enabled(&state.pool).await;
    if !enabled {
        #[cfg(debug_assertions)]
        eprintln!("[API Error] Request rejected — API is disabled");
        return Err(StatusCode::FORBIDDEN);
    }

    let auth_header = request
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("");

    let token = auth_header.strip_prefix("Bearer ").unwrap_or("").trim();

    if token.is_empty() {
        #[cfg(debug_assertions)]
        eprintln!("[API Error] Request rejected — missing Bearer token");
        return Err(StatusCode::UNAUTHORIZED);
    }

    let stored_key = get_api_key(&state.pool).await;
    match stored_key {
        Some(key) if key == token => {
            #[cfg(debug_assertions)]
            println!("[API] Authenticated request");
            Ok(next.run(request).await)
        }
        _ => {
            #[cfg(debug_assertions)]
            eprintln!("[API Error] Request rejected — invalid API key");
            Err(StatusCode::UNAUTHORIZED)
        }
    }
}

async fn get_api_key(pool: &sqlx::SqlitePool) -> Option<String> {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = 'api_key'")
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
}

async fn get_api_enabled(pool: &sqlx::SqlitePool) -> bool {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = 'api_enabled'")
        .fetch_optional(pool)
        .await
        .ok()
        .flatten()
        .map(|v| v == "true")
        .unwrap_or(false)
}
