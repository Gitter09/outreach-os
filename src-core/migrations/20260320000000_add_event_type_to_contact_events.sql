-- Add event_type to distinguish system-generated activity events from user-scheduled events.
-- 'user_event' = manually added by user (shows in Upcoming Events section)
-- 'activity'   = auto-written by system (shows in Activity tab)
ALTER TABLE contact_events ADD COLUMN event_type TEXT NOT NULL DEFAULT 'user_event';

-- Backfill: events already created by the system (status changes, email sends)
-- have titles starting with 'Moved to' or 'Email sent:'
UPDATE contact_events SET event_type = 'activity'
WHERE title LIKE 'Moved to %' OR title LIKE 'Email sent:%';

CREATE INDEX IF NOT EXISTS idx_contact_events_type ON contact_events(contact_id, event_type);
