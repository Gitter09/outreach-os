use crate::api::{
    error::{ApiError, ApiResponse},
    AppState,
};
use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;

pub async fn list_accounts(
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<Vec<serde_json::Value>>>, ApiError> {
    let service = jobdex_core::EmailService::new(jobdex_core::Db::from_pool(state.pool.clone()));
    let accounts = service
        .list_accounts()
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    let safe: Vec<serde_json::Value> = accounts
        .iter()
        .map(|a| {
            serde_json::json!({
                "id": a.id,
                "provider": a.provider,
                "email": a.email,
                "expires_at": a.expires_at,
                "last_synced_at": a.last_synced_at,
            })
        })
        .collect();
    Ok(Json(ApiResponse::ok(safe)))
}

pub async fn delete_account(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let service = jobdex_core::EmailService::new(jobdex_core::Db::from_pool(state.pool.clone()));
    service
        .delete_account(&id)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    Ok(Json(ApiResponse::ok(
        serde_json::json!({ "deleted": true }),
    )))
}

pub async fn sync_all(
    State(state): State<AppState>,
) -> Result<Json<ApiResponse<Vec<jobdex_core::SyncResult>>>, ApiError> {
    let service = jobdex_core::EmailService::new(jobdex_core::Db::from_pool(state.pool.clone()));
    let results = service
        .sync_all_accounts()
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    Ok(Json(ApiResponse::ok(results)))
}

pub async fn sync_account(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<jobdex_core::SyncResult>>, ApiError> {
    let service = jobdex_core::EmailService::new(jobdex_core::Db::from_pool(state.pool.clone()));
    let result = service
        .sync_account(&id)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    Ok(Json(ApiResponse::ok(result)))
}

#[derive(Deserialize)]
pub struct ListEmailsQuery {
    pub status_filter: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

pub async fn list_all(
    State(state): State<AppState>,
    Query(params): Query<ListEmailsQuery>,
) -> Result<Json<ApiResponse<Vec<jobdex_core::models::EmailMessage>>>, ApiError> {
    let service = jobdex_core::EmailService::new(jobdex_core::Db::from_pool(state.pool.clone()));
    let emails = service
        .get_all_emails(
            params.status_filter.as_deref(),
            params.limit.unwrap_or(100),
            params.offset.unwrap_or(0),
        )
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    Ok(Json(ApiResponse::ok(emails)))
}

pub async fn list_for_contact(
    State(state): State<AppState>,
    Path(contact_id): Path<String>,
) -> Result<Json<ApiResponse<Vec<jobdex_core::models::EmailMessage>>>, ApiError> {
    let service = jobdex_core::EmailService::new(jobdex_core::Db::from_pool(state.pool.clone()));
    let emails = service
        .get_emails_for_contact(&contact_id)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    Ok(Json(ApiResponse::ok(emails)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendEmailBody {
    pub account_id: String,
    pub contact_id: Option<String>,
    pub to: String,
    pub subject: String,
    pub body: String,
}

pub async fn send_email(
    State(state): State<AppState>,
    Json(body): Json<SendEmailBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let service = jobdex_core::EmailService::new(jobdex_core::Db::from_pool(state.pool.clone()));
    let message_id = service
        .send_email(
            &body.account_id,
            &body.to,
            &body.subject,
            &body.body,
            vec![],
        )
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    if let Some(ref cid) = body.contact_id {
        let event_id = uuid::Uuid::new_v4().to_string();
        let _ = sqlx::query(
            "INSERT INTO contact_events (id, contact_id, title, description, event_at, event_type) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'activity')",
        )
        .bind(&event_id)
        .bind(cid)
        .bind(format!("Email sent: {}", body.subject))
        .bind(Option::<String>::None)
        .execute(&state.pool)
        .await;
    }

    Ok(Json(ApiResponse::ok(
        serde_json::json!({ "message_id": message_id }),
    )))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleEmailBody {
    pub account_id: String,
    pub contact_id: String,
    pub subject: String,
    pub body: String,
    pub scheduled_at: i64,
}

pub async fn schedule_email(
    State(state): State<AppState>,
    Json(body): Json<ScheduleEmailBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    let service = jobdex_core::EmailService::new(jobdex_core::Db::from_pool(state.pool.clone()));
    let id = service
        .schedule_email(
            &body.account_id,
            &body.contact_id,
            &body.subject,
            &body.body,
            body.scheduled_at,
            vec![],
        )
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    let event_id = uuid::Uuid::new_v4().to_string();
    let _ = sqlx::query(
        "INSERT INTO contact_events (id, contact_id, title, description, event_at, event_type) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, 'activity')",
    )
    .bind(&event_id)
    .bind(&body.contact_id)
    .bind(format!("Email scheduled: {}", body.subject))
    .bind(Option::<String>::None)
    .execute(&state.pool)
    .await;

    Ok(Json(ApiResponse::ok(serde_json::json!({ "id": id }))))
}

#[derive(Deserialize)]
pub struct ListScheduledQuery {
    pub contact_id: Option<String>,
}

pub async fn list_scheduled(
    State(state): State<AppState>,
    Query(params): Query<ListScheduledQuery>,
) -> Result<Json<ApiResponse<Vec<serde_json::Value>>>, ApiError> {
    let pool = &state.pool;

    #[derive(sqlx::FromRow)]
    struct ScheduledRow {
        id: String,
        contact_id: String,
        contact_first_name: String,
        contact_last_name: String,
        account_id: String,
        subject: String,
        body: String,
        scheduled_at: chrono::DateTime<chrono::Utc>,
        status: String,
        error_message: Option<String>,
        created_at: chrono::DateTime<chrono::Utc>,
    }

    let rows = if let Some(cid) = params.contact_id {
        sqlx::query_as::<_, ScheduledRow>(
            "SELECT se.id, se.contact_id,
                    COALESCE(c.first_name, '') AS contact_first_name,
                    COALESCE(c.last_name, '') AS contact_last_name,
                    se.account_id, se.subject, se.body, se.scheduled_at, se.status,
                    se.error_message, se.created_at
             FROM scheduled_emails se
             LEFT JOIN contacts c ON se.contact_id = c.id
             WHERE se.contact_id = ?
             ORDER BY se.scheduled_at ASC",
        )
        .bind(cid)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, ScheduledRow>(
            "SELECT se.id, se.contact_id,
                    COALESCE(c.first_name, '') AS contact_first_name,
                    COALESCE(c.last_name, '') AS contact_last_name,
                    se.account_id, se.subject, se.body, se.scheduled_at, se.status,
                    se.error_message, se.created_at
             FROM scheduled_emails se
             LEFT JOIN contacts c ON se.contact_id = c.id
             ORDER BY se.scheduled_at ASC",
        )
        .fetch_all(pool)
        .await?
    };

    let result: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            serde_json::json!({
                "id": r.id,
                "contactId": r.contact_id,
                "contactFirstName": r.contact_first_name,
                "contactLastName": r.contact_last_name,
                "accountId": r.account_id,
                "subject": r.subject,
                "body": r.body,
                "scheduledAt": r.scheduled_at,
                "status": r.status,
                "errorMessage": r.error_message,
                "createdAt": r.created_at,
            })
        })
        .collect();

    Ok(Json(ApiResponse::ok(result)))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateScheduledBody {
    pub subject: Option<String>,
    pub body: Option<String>,
    pub scheduled_at: Option<i64>,
}

pub async fn update_scheduled(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateScheduledBody>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    if let Some(ts) = body.scheduled_at {
        let scheduled_time = chrono::DateTime::from_timestamp(ts, 0)
            .ok_or_else(|| ApiError::Validation("Invalid timestamp".into()))?;
        sqlx::query("UPDATE scheduled_emails SET subject = COALESCE(?, subject), body = COALESCE(?, body), scheduled_at = ? WHERE id = ? AND status = 'pending'")
            .bind(&body.subject)
            .bind(&body.body)
            .bind(scheduled_time)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    } else {
        sqlx::query("UPDATE scheduled_emails SET subject = COALESCE(?, subject), body = COALESCE(?, body) WHERE id = ? AND status = 'pending'")
            .bind(&body.subject)
            .bind(&body.body)
            .bind(&id)
            .execute(&state.pool)
            .await?;
    }
    Ok(Json(ApiResponse::ok(
        serde_json::json!({ "updated": true }),
    )))
}

pub async fn cancel_scheduled(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, ApiError> {
    sqlx::query("DELETE FROM scheduled_emails WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;
    Ok(Json(ApiResponse::ok(
        serde_json::json!({ "cancelled": true }),
    )))
}
