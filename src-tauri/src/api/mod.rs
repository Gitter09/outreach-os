pub mod auth;
pub mod error;
pub mod handlers;
pub mod routes;

use handlers::sse::SessionMap;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::broadcast;
use tokio::sync::RwLock;

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub sse_sessions: SessionMap,
}

pub async fn start_server(
    pool: SqlitePool,
    mut shutdown_rx: broadcast::Receiver<()>,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let settings = jobdex_core::settings::SettingsManager::new(pool.clone());

    let enabled_str = settings.get("api_enabled").await.unwrap_or(None);
    let enabled = enabled_str.as_deref() == Some("true");

    if !enabled {
        #[cfg(debug_assertions)]
        println!("[API] API server disabled in settings. Not starting.");
        let _ = shutdown_rx.recv().await;
        return Ok(());
    }

    let port_str = settings
        .get("api_port")
        .await
        .unwrap_or(None)
        .unwrap_or_else(|| "13420".to_string());
    let port: u16 = port_str.parse().unwrap_or(13420);

    let state = AppState {
        pool: pool.clone(),
        sse_sessions: Arc::new(RwLock::new(HashMap::new())),
    };
    let app = routes::create_router(state);

    let listener = tokio::net::TcpListener::bind(format!("127.0.0.1:{}", port)).await?;

    #[cfg(debug_assertions)]
    println!("[API] Server starting on 127.0.0.1:{}", port);

    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            let _ = shutdown_rx.recv().await;
            #[cfg(debug_assertions)]
            println!("[API] Shutdown signal received, stopping server.");
        })
        .await?;

    #[cfg(debug_assertions)]
    println!("[API] Server stopped.");
    Ok(())
}
