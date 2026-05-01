use crate::db::models::{Contact, Tag};
use sqlx::SqlitePool;
use std::collections::HashMap;

/// Shared SELECT base for fetching contacts with status JOIN and effective_next_date.
/// Append `WHERE c.id = ?` or `ORDER BY ...` to complete the query.
pub const CONTACT_SELECT_BASE: &str = r#"
    SELECT
        c.*,
        s.label AS status_label,
        s.color AS status_color,
        (
            SELECT MIN(d)
            FROM (
                SELECT c.next_contact_date AS d WHERE c.next_contact_date IS NOT NULL
                UNION ALL
                SELECT MIN(event_at) AS d
                FROM contact_events
                WHERE contact_id = c.id
                  AND event_type = 'user_event'
                  AND event_at >= CURRENT_TIMESTAMP
            )
        ) AS effective_next_date
    FROM contacts c
    LEFT JOIN statuses s ON c.status_id = s.id
"#;

/// Contact data enriched with tags, ready for serialization to the frontend.
#[derive(Debug, serde::Serialize)]
pub struct ContactWithTags {
    #[serde(flatten)]
    pub contact: Contact,
    pub tags: Vec<Tag>,
}

/// Internal struct for tag assignment lookups.
#[derive(sqlx::FromRow)]
struct TagAssignment {
    contact_id: String,
    id: String,
    name: String,
    color: String,
    created_at: chrono::DateTime<chrono::Utc>,
}

/// Fetches all contacts with their status labels/colors and enriches them with tags.
pub async fn get_all_contacts_with_tags(
    pool: &SqlitePool,
) -> Result<Vec<ContactWithTags>, sqlx::Error> {
    let sql = format!("{} ORDER BY c.updated_at DESC", CONTACT_SELECT_BASE);
    let contacts = sqlx::query_as::<sqlx::Sqlite, Contact>(&sql)
        .fetch_all(pool)
        .await?;

    enrich_with_tags(pool, contacts).await
}

/// Fetches a single contact by ID with status and tags.
pub async fn get_contact_by_id_with_tags(
    pool: &SqlitePool,
    id: &str,
) -> Result<Option<ContactWithTags>, sqlx::Error> {
    let sql = format!("{} WHERE c.id = ?", CONTACT_SELECT_BASE);
    let contact = sqlx::query_as::<sqlx::Sqlite, Contact>(&sql)
        .bind(id)
        .fetch_optional(pool)
        .await?;

    match contact {
        Some(c) => {
            let enriched = enrich_with_tags(pool, vec![c]).await?;
            Ok(Some(enriched.into_iter().next().unwrap()))
        }
        None => Ok(None),
    }
}

/// Enriches a list of contacts with their associated tags.
pub async fn enrich_with_tags(
    pool: &SqlitePool,
    contacts: Vec<Contact>,
) -> Result<Vec<ContactWithTags>, sqlx::Error> {
    let assignments = sqlx::query_as::<sqlx::Sqlite, TagAssignment>(
        r#"
        SELECT ct.contact_id, t.id, t.name, t.color, t.created_at
        FROM tags t
        JOIN contact_tags ct ON t.id = ct.tag_id
        "#,
    )
    .fetch_all(pool)
    .await?;

    let mut tags_by_contact: HashMap<String, Vec<Tag>> = HashMap::new();
    for a in assignments {
        tags_by_contact.entry(a.contact_id).or_default().push(Tag {
            id: a.id,
            name: a.name,
            color: a.color,
            created_at: a.created_at,
        });
    }

    let result: Vec<ContactWithTags> = contacts
        .into_iter()
        .map(|c| {
            let tags = tags_by_contact.remove(&c.id).unwrap_or_default();
            ContactWithTags { contact: c, tags }
        })
        .collect();

    Ok(result)
}
