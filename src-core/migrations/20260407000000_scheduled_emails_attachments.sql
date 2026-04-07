-- Add attachment_paths column to scheduled_emails.
-- Stored as a JSON array of absolute filesystem paths (e.g. '[]' or '["/path/to/file.pdf"]').
-- Existing rows get an empty array as default.
ALTER TABLE scheduled_emails ADD COLUMN attachment_paths TEXT NOT NULL DEFAULT '[]';
