-- Add dedicated events table for contacts
CREATE TABLE IF NOT EXISTS contact_events (
    id TEXT PRIMARY KEY NOT NULL,
    contact_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    event_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_contact_events_contact_id ON contact_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_events_event_at ON contact_events(event_at);
