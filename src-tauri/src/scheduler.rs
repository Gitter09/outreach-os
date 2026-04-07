use anyhow::Result;
use jobdex_core::db::Db;
use jobdex_core::email_service::EmailService;
use sqlx::Row;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::time;

#[derive(Clone, serde::Serialize)]
struct ScheduleFailedPayload {
    email_id: String,
    to_email: String,
    subject: String,
    error: String,
}

struct PendingEmail {
    schedule_id: String,
    account_id: String,
    subject: String,
    body: String,
    to_email: Option<String>,
    attachment_paths: String,
}

static SHUTDOWN_FLAG: AtomicBool = AtomicBool::new(false);

pub fn start_email_scheduler(app_handle: AppHandle, db: Db) {
    tauri::async_runtime::spawn(async move {
        let mut interval = time::interval(Duration::from_secs(60));
        let email_service = EmailService::new(db.clone());

        loop {
            interval.tick().await;

            if SHUTDOWN_FLAG.load(Ordering::Relaxed) {
                #[cfg(debug_assertions)]
                eprintln!("Scheduler shutting down — app is closing");
                break;
            }

            if let Err(_e) = check_and_send_scheduled_emails(&app_handle, &db, &email_service).await
            {
                #[cfg(debug_assertions)]
                eprintln!("Error in scheduled email loop: {}", _e);
            }
        }
    });
}

pub fn stop_email_scheduler() {
    SHUTDOWN_FLAG.store(true, Ordering::Relaxed);
}

async fn check_and_send_scheduled_emails(
    app_handle: &AppHandle,
    db: &Db,
    email_service: &EmailService,
) -> Result<()> {
    // 1. Fetch pending emails whose scheduled time has passed
    // We join with contacts to get the recipient email address
    let rows = sqlx::query(
        r#"
        SELECT
            s.id as schedule_id,
            s.account_id,
            s.subject,
            s.body,
            c.email as to_email,
            s.attachment_paths
        FROM scheduled_emails s
        JOIN contacts c ON s.contact_id = c.id
        WHERE s.status = 'pending'
        AND datetime(s.scheduled_at) <= CURRENT_TIMESTAMP
        "#,
    )
    .fetch_all(db.pool())
    .await?;

    let pending_emails: Vec<PendingEmail> = rows
        .into_iter()
        .map(|row| PendingEmail {
            schedule_id: row.get("schedule_id"),
            account_id: row.get("account_id"),
            subject: row.get("subject"),
            body: row.get("body"),
            to_email: row.get("to_email"),
            attachment_paths: row.get::<Option<String>, _>("attachment_paths").unwrap_or_else(|| "[]".to_string()),
        })
        .collect();

    #[cfg(debug_assertions)]
    if pending_emails.is_empty() {
        return Ok(());
    }

    #[cfg(debug_assertions)]
    println!(
        "Found {} scheduled emails ready to send",
        pending_emails.len()
    );

    for email in pending_emails {
        let to_email = match email.to_email {
            Some(e) if !e.trim().is_empty() => e,
            _ => {
                #[cfg(debug_assertions)]
                eprintln!(
                    "Skipping scheduled email {} because contact has no email",
                    email.schedule_id
                );
                // Mark as failed permanently
                let _ = sqlx::query("UPDATE scheduled_emails SET status = 'failed', error_message = 'Contact has no email address' WHERE id = ?")
                    .bind(&email.schedule_id)
                    .execute(db.pool())
                    .await;
                continue;
            }
        };

        // 2. Attempt to send
        let paths: Vec<String> =
            serde_json::from_str(&email.attachment_paths).unwrap_or_default();
        match email_service
            .send_email(&email.account_id, &to_email, &email.subject, &email.body, paths)
            .await
        {
            Ok(_message_id) => {
                // 3. Mark as sent
                #[cfg(debug_assertions)]
                println!("Successfully sent scheduled email {}", email.schedule_id);
                let _ = sqlx::query("UPDATE scheduled_emails SET status = 'sent' WHERE id = ?")
                    .bind(&email.schedule_id)
                    .execute(db.pool())
                    .await;
            }
            Err(e) => {
                // 4. Handle failure
                // We leave it as 'pending' so it can retry later, but emit an event to notify the user.
                let error_msg = e.to_string();
                #[cfg(debug_assertions)]
                eprintln!(
                    "Failed to send scheduled email {}: {}",
                    email.schedule_id, error_msg
                );

                // Emit event to frontend
                let _ = app_handle.emit(
                    "email_schedule_failed",
                    ScheduleFailedPayload {
                        email_id: email.schedule_id.clone(),
                        to_email: to_email.clone(),
                        subject: email.subject.clone(),
                        error: error_msg,
                    },
                );
            }
        }
    }

    Ok(())
}
