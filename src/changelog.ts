export interface ChangelogEntry {
    label: string;
    detail: string;
}

export interface Release {
    version: string;
    date: string;
    entries: ChangelogEntry[];
}

export const CHANGELOG: Release[] = [
    {
        version: "0.1.3",
        date: "March 2026",
        entries: [
            {
                label: "Activity timeline",
                detail: "Status changes and sent emails now show up automatically on each contact's timeline.",
            },
            {
                label: "Email signatures",
                detail: "Create signatures once in Settings and pick them when you compose.",
            },
            {
                label: "Scheduled emails",
                detail: "See all your queued sends in one place. Cancel any of them before they go out.",
            },
            {
                label: "Attached files",
                detail: "Attach a resume, cover letter, or any file directly to a contact.",
            },
            {
                label: "Schedule date picker",
                detail: "Replaced the clunky browser date input with a proper calendar + time picker.",
            },
            {
                label: "Bulk status update",
                detail: "Select multiple contacts and move them through your pipeline in one go.",
            },
            {
                label: "Variable chips in subject",
                detail: "{{first_name}} and friends now insert at the cursor in the subject line too.",
            },
            {
                label: "Delete activity entries",
                detail: "Hover over any timeline event to remove it. Duplicate entries are gone.",
            },
        ],
    },
];

// The most recent release — used by the About tab and the What's New modal (M12)
export const LATEST_RELEASE = CHANGELOG[0];
