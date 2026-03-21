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

    // Legacy support (will be populated with status_label from join)
    status?: string;

    status_id?: string;
    status_label?: string;
    status_color?: string;

    last_contacted_date?: string; // ISO string
    next_contact_date?: string;
    effective_next_date?: string; // Earliest of manual date or next scheduled event
    next_contact_event?: string;
    cadence_stage?: number;

    intelligence_summary?: string;
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
    created_at: string;
    updated_at: string;
}
