-- Email CRM Phase 1: Core Connectivity
-- Stores multiple email accounts (Gmail, Outlook)
CREATE TABLE IF NOT EXISTS email_accounts (
    id TEXT PRIMARY KEY,
    provider TEXT NOT NULL, -- 'gmail', 'outlook'
    email TEXT NOT NULL UNIQUE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at INTEGER, -- Timestamp in seconds
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Email threads linked to contacts
CREATE TABLE IF NOT EXISTS email_threads (
    id TEXT PRIMARY KEY, -- provider-specific thread ID
    contact_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    subject TEXT,
    last_message_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE
);

-- Individual email messages
CREATE TABLE IF NOT EXISTS email_messages (
    id TEXT PRIMARY KEY, -- provider-specific message ID
    thread_id TEXT NOT NULL,
    from_email TEXT NOT NULL,
    to_email TEXT NOT NULL,
    subject TEXT,
    body TEXT,
    html_body TEXT,
    sent_at DATETIME,
    status TEXT DEFAULT 'received', -- 'received', 'sent', 'draft'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (thread_id) REFERENCES email_threads(id) ON DELETE CASCADE
);

-- Scheduled emails waiting to be sent
CREATE TABLE IF NOT EXISTS scheduled_emails (
    id TEXT PRIMARY KEY,
    contact_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    body TEXT NOT NULL,
    scheduled_at DATETIME NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    error_message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES email_accounts(id) ON DELETE CASCADE
);

-- Update updated_at trigger for email_accounts
CREATE TRIGGER IF NOT EXISTS update_email_accounts_updated_at 
AFTER UPDATE ON email_accounts
FOR EACH ROW
BEGIN
    UPDATE email_accounts SET updated_at = CURRENT_TIMESTAMP WHERE id = OLD.id;
END;
