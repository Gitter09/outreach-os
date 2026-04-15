export interface Contact {
    id: string;
    // Base Info
    first_name: string;
    last_name: string;
    title?: string;
    company?: string;
    location?: string;

    email?: string;
    linkedin_url?: string;
    company_website?: string;

    status_id?: string;
    status_label?: string;
    status_color?: string;

    last_contacted_date?: string; // ISO string
    next_contact_date?: string;
    effective_next_date?: string; // Earliest of manual date or next scheduled event
    next_contact_event?: string;
    cadence_stage?: number;

    summary?: string;
    created_at: string;
    updated_at: string;
    tags?: Tag[];
}

export interface Status {
    id: string;
    label: string;
    color: string;
    is_default: boolean;
    position: number;
}

export interface Tag {
    id: string;
    name: string;
    color: string;
    created_at: string;
}

export interface EmailAccount {
    id: string;
    provider: string;
    email: string;
    expires_at?: number;
    last_synced_at?: string;
    created_at: string;
    updated_at: string;
}

export interface EmailMessage {
    id: string;
    thread_id: string;
    from_email: string;
    to_email: string;
    subject?: string;
    body?: string;
    html_body?: string;
    sent_at?: string;
    status?: string;
    provider_message_id?: string;
    manually_assigned?: number;
    created_at: string;
}

export interface EmailAttachment {
    id: string;
    messageId: string;
    filename: string;
    contentType: string;
    fileSize: number;
    filePath: string;
    createdAt: string;
}

export interface ContactEvent {
    id: string;
    contact_id: string;
    title: string;
    description?: string;
    event_at: string;
    created_at: string;
    updated_at: string;
}

export interface EmailTemplate {
    id: string;
    name: string;
    subject?: string;
    body?: string;
    attachment_paths: string[];
    created_at: string;
    updated_at: string;
}

export interface ContactFile {
    id: string;
    contactId: string;
    filename: string;
    filePath: string;
    createdAt: string;
}

export interface EmailSignature {
    id: string;
    name: string;
    content: string;
    createdAt: string;
    updatedAt: string;
}

export interface SyncResult {
    account_id: string;
    account_email: string;
    provider: string;
    synced_count: number;
    skipped_count: number;
    token_expired: boolean;
    error?: string;
}

export interface ImportPreview {
    headers: string[];
    total_rows: number;
}

export interface ImportAnalysis {
    total_detected: number;
    new_count: number;
    duplicate_count: number;
}

export interface ImportResult {
    imported: number;
    skipped: number;
    merged: number;
    failed: number;
    errors: string[];
}

export interface ColumnMapping {
    first_name: number | null;
    last_name: number | null;
    email: number | null;
    linkedin_url: number | null;
    company: number | null;
    title: number | null;
    location: number | null;
    company_website: number | null;
    intelligence_summary: number[];
}

export interface ImportSummary {
    contactsAdded: number;
    contactsUpdated: number;
    statusesAdded: number;
    tagsAdded: number;
    eventsRestored: number;
    templatesRestored: number;
    signaturesRestored: number;
    scheduledRestored: number;
}

export interface ScheduledEmail {
    id: string;
    contactId: string;
    contactFirstName: string;
    contactLastName: string;
    accountId: string;
    subject: string;
    body: string;
    scheduledAt: string; // ISO string
    status: string; // 'pending', 'sent', 'failed'
    errorMessage?: string;
    createdAt: string;
    attachmentPaths?: string[];
}
