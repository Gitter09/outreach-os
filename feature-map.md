# OutreachOS — Feature Map

> **Purpose**: A plain-English map of every user-facing feature in OutreachOS, showing what it does, where it lives in the UI, and what code powers it. Updated automatically after every feature change.
>
> **Audience**: Non-technical project owner and any AI agent working on the codebase.
>
> **Last updated**: _(agent updates this date on every change)_
>
> **How to read this**: Each feature entry tells you what the feature does for the user, where to find it in the app, its current status, and what files/commands/tables are involved. You do not need to understand the code — the Notes field will flag anything important you need to know about a feature's current limitations.

---

## Status Key

| Symbol | Meaning |
|---|---|
| ✅ Complete | Fully built and functional |
| 🔶 Partial | Core functionality works but some parts are incomplete or missing |
| 🔴 Placeholder | Linked in the app but not built — shows empty or placeholder content |
| ⚠️ Dead code suspected | Code exists but may not serve any active function |

---

## 1. Contacts

### View All Contacts

**What it does for the user:**
Shows the user a list of all their contacts. The user can switch between a spreadsheet-style table view and a visual Kanban board where contacts are grouped by their pipeline stage.

**Where it lives in the UI:**
Sidebar → Contacts. Toggle between Table and Kanban using buttons at the top of the page.

**Status:** ✅ Complete

**Files involved:**
- `src/pages/ContactsPage.tsx` — main page with table and kanban views
- `src/components/kanban/KanbanBoard.tsx`, `KanbanColumn.tsx`, `KanbanCard.tsx` — kanban view
- `src-tauri/src/lib.rs` — commands listed below

**Tauri commands used:**
- `get_contacts` — fetches all contacts with their status and tags

**Database tables touched:**
- `contacts` — all contact records
- `statuses` — joined to get status label and color per contact
- `contact_tags` + `tags` — joined to get tags per contact

**Notes:**
Tag-based filtering is not yet fully wired — the user can filter by pipeline status but not by tag. This is a known gap on the roadmap.

---

### View a Single Contact

**What it does for the user:**
Opens a full profile page for one contact, showing all their details, email history, and a personal summary the user has written about them.

**Where it lives in the UI:**
Click any contact name in the contacts list or kanban board to open their profile page.

**Status:** ✅ Complete

**Files involved:**
- `src/pages/ContactDetailPage.tsx` — full contact profile (~650 lines, most complex page)
- `src/components/contacts/EmailHistoryTab.tsx` — email history tab
- `src-tauri/src/lib.rs` — commands listed below

**Tauri commands used:**
- `get_contact_by_id` — fetches a single contact record by ID
- `get_emails_for_contact` — fetches email history for this contact
- `get_email_tracking` — fetches open/click tracking events per email
- `update_contact` — used when saving the intelligence summary

**Database tables touched:**
- `contacts` — primary contact data
- `statuses` — contact's current pipeline status
- `tags` / `contact_tags` — contact's assigned tags
- `email_messages` — email history
- `email_tracking` — open and click events

**Notes:**
None.

---

### Add a Contact

**What it does for the user:**
Opens a form where the user can manually enter a new contact's details — name, email, LinkedIn URL, company, title, and location.

**Where it lives in the UI:**
Top bar → "Add Contact" button, or via the ⌘K command palette → "Add Contact".

**Status:** ✅ Complete

**Files involved:**
- `src/components/contacts/AddContactDialog.tsx`
- `src-tauri/src/lib.rs`

**Tauri commands used:**
- `add_contact` — creates a new contact record, defaults to "New" status

**Database tables touched:**
- `contacts`

**Notes:**
Magic Paste (AI-powered clipboard parsing to auto-fill the form) was previously available but was deliberately removed in v0.1.1 for stability. It is planned for re-enablement in a future version using the user's own AI API key.

---

### Edit a Contact

**What it does for the user:**
Lets the user update any field on an existing contact — name, email, company, LinkedIn URL, and so on.

**Where it lives in the UI:**
Contact detail page → Edit button in the profile header.

**Status:** ✅ Complete

**Files involved:**
- `src/components/contacts/EditContactDialog.tsx`
- `src-tauri/src/lib.rs`

**Tauri commands used:**
- `update_contact` — updates only the fields provided, leaves others unchanged

**Database tables touched:**
- `contacts`

**Notes:**
None.

---

### Delete a Contact

**What it does for the user:**
Permanently removes a contact and all associated data. The user is shown a confirmation dialog before deletion proceeds.

**Where it lives in the UI:**
Contact detail page → Delete button in the profile header. Also available as a bulk action in the contacts list.

**Status:** ✅ Complete

**Files involved:**
- `src/pages/ContactDetailPage.tsx` — single delete
- `src/pages/ContactsPage.tsx` — bulk delete
- `src-tauri/src/lib.rs`

**Tauri commands used:**
- `delete_contact` — deletes a single contact
- `delete_contacts_bulk` — deletes multiple contacts in one transaction

**Database tables touched:**
- `contacts`
- `contact_tags` — junction table entries are also removed

**Notes:**
None.

---

### Write a Contact Summary

**What it does for the user:**
Lets the user write a personal freeform summary about a contact — relationship history, notes from a meeting, key facts to remember before an email.

**Where it lives in the UI:**
Contact detail page → Summary tab → "Edit Summary" button.

**Status:** ✅ Complete

**Files involved:**
- `src/pages/ContactDetailPage.tsx`
- `src-tauri/src/lib.rs`

**Tauri commands used:**
- `update_contact` — saves the `intelligence_summary` field

**Database tables touched:**
- `contacts` — `intelligence_summary` column

**Notes:**
AI-powered summary generation ("Enrich with AI") was previously available but was deliberately removed in v0.1.1. The summary is now entirely manual. AI enrichment is planned for re-enablement in a future version.

---

### Import Contacts from LinkedIn / CSV

**What it does for the user:**
Lets the user import a large list of contacts from a spreadsheet file (CSV or XLSX, such as a LinkedIn connections export). The user maps the spreadsheet columns to contact fields and chooses how to handle duplicates.

**Where it lives in the UI:**
Top bar → "Import" button, or via ⌘K → "Import Contacts".

**Status:** ✅ Complete

**Files involved:**
- `src/components/import/ImportDialog.tsx` — 2-step import flow (mapping → duplicate check)
- `src-tauri/src/lib.rs`
- `src-core/src/` — CSV and XLSX parsing logic

**Tauri commands used:**
- `get_import_headers` — reads column names from the file without loading all rows
- `analyze_import` — dry-run to count new vs. duplicate contacts
- `import_contacts` — executes the import with chosen deduplication mode

**Database tables touched:**
- `contacts`

**Notes:**
Deduplication checks for: exact email match, LinkedIn URL match, and first name + last name + company match. Three import modes: Skip duplicates, Merge (fill missing fields), or Import All.

---

### Bulk Status Update

**What it does for the user:**
Lets the user select multiple contacts at once and move them all to a different pipeline stage in one action.

**Where it lives in the UI:**
Contacts page → select multiple contacts using checkboxes → "Update Status" bulk action button.

**Status:** ✅ Complete

**Files involved:**
- `src/pages/ContactsPage.tsx`
- `src-tauri/src/lib.rs`

**Tauri commands used:**
- `update_contacts_status_bulk` — updates status_id for multiple contacts in one transaction

**Database tables touched:**
- `contacts`

**Notes:**
None.

---

## 2. Email

### Send an Email

**What it does for the user:**
Lets the user write and send an email to a contact directly from within OutreachOS, using their connected Gmail or Outlook account.

**Where it lives in the UI:**
Contact detail page → "Compose Email" button in the profile header.

**Status:** ✅ Complete

**Files involved:**
- `src/components/email/ComposeEmailDialog.tsx`
- `src-tauri/src/lib.rs`
- `src-core/src/` — EmailService

**Tauri commands used:**
- `email_send` — sends immediately via Gmail or Outlook API
- `get_email_accounts` — populates the "Send from" account selector

**Database tables touched:**
- `email_accounts` — to get the sending account's OAuth token
- `email_messages` — sent email is stored here

**Notes:**
AI-powered subject line and body suggestions were previously available but were deliberately removed in v0.1.1. Email composition is now manual. AI drafting is planned for re-enablement in a future version.

---

### Schedule an Email

**What it does for the user:**
Lets the user write an email and set a future date and time for it to be sent automatically.

**Where it lives in the UI:**
Compose Email dialog → "Schedule" option instead of "Send Now".

**Status:** 🔶 Partial

**Files involved:**
- `src/components/email/ComposeEmailDialog.tsx`
- `src-tauri/src/lib.rs`

**Tauri commands used:**
- `email_schedule` — stores the scheduled email with a timestamp

**Database tables touched:**
- `email_schedule` (or equivalent) — stores pending scheduled emails

**Notes:**
⚠️ **Important limitation**: Scheduling an email saves it to the database, but the background worker that actually checks for and sends scheduled emails at the right time has not been built yet. This means scheduled emails are stored but never dispatched. This is a known gap on the roadmap.

---

### Sync Email Inbox

**What it does for the user:**
Pulls in recent emails from the user's Gmail or Outlook inbox and links them to the matching contacts in OutreachOS, so the user can see conversation history on each contact's profile.

**Where it lives in the UI:**
Settings → Email Integration → Sync button. Also triggered automatically on relevant actions.

**Status:** ✅ Complete

**Files involved:**
- `src/components/settings/EmailSettingsTab.tsx`
- `src-tauri/src/lib.rs`
- `src-core/src/` — EmailService sync logic

**Tauri commands used:**
- `sync_email_accounts` — syncs all connected accounts
- `sync_email_account` — syncs a single account
- `reset_email_sync_state` — forces a full re-fetch from scratch

**Database tables touched:**
- `email_messages` — stores synced emails
- `email_accounts` — tracks last sync time per account

**Notes:**
Emails are linked to contacts by matching email addresses. If a contact's email address is not in OutreachOS, their emails will not appear on their profile.

---

### Emails Page

**What it does for the user:**
A unified inbox view showing all synced emails across all connected accounts in one place.

**Where it lives in the UI:**
Sidebar → Emails.

**Status:** 🔴 Placeholder

**Files involved:**
- `src/pages/EmailsPage.tsx` — placeholder only, no functionality

**Tauri commands used:**
- None yet

**Database tables touched:**
- None yet

**Notes:**
The sidebar link exists and the page file exists, but the page contains no real content. Clicking it shows a placeholder. Building this page is on the post-launch roadmap.

---

## 3. Email Tracking

### Track Email Opens and Clicks

**What it does for the user:**
Automatically detects when a recipient opens an email or clicks a link inside it. This information appears on the contact's profile under their email history.

**Where it lives in the UI:**
Contact detail page → Emails tab → each sent email shows open/click events with timestamps.

**Status:** ✅ Complete

**Files involved:**
- `src/pages/ContactDetailPage.tsx` — displays tracking events
- `src/components/contacts/EmailHistoryTab.tsx`
- `src-tauri/src/lib.rs`

**Tauri commands used:**
- `poll_email_tracking` — fetches new open/click events from the tracking relay
- `get_email_tracking` — retrieves stored events for a specific email message

**Database tables touched:**
- `email_tracking` — stores open and click events per message

**Notes:**
Tracking requires a relay server. Two modes are supported: (1) the commercial OutreachOS relay at `*.outreachos.io` (requires a connected Clerk account), and (2) a self-hosted relay the user operates themselves (requires manual URL and secret configuration in Settings → Email).

---

## 4. Pipeline

### Pipeline Kanban Board

**What it does for the user:**
A visual drag-and-drop board where contacts are represented as cards organized into columns by their pipeline stage. The user can drag a card from one column to another to update that contact's status.

**Where it lives in the UI:**
Contacts page → Kanban view toggle.

**Status:** ✅ Complete

**Files involved:**
- `src/components/kanban/KanbanBoard.tsx`
- `src/components/kanban/KanbanColumn.tsx`
- `src/components/kanban/KanbanCard.tsx`
- `src-tauri/src/lib.rs`

**Tauri commands used:**
- `get_contacts` — fetches all contacts grouped by status
- `update_contact` — updates status when a card is dragged

**Database tables touched:**
- `contacts` — `status_id` column updated on drag
- `statuses` — defines the columns

**Notes:**
None.

---

### Manage Pipeline Stages

**What it does for the user:**
Lets the user create, rename, recolor, and delete the stages in their pipeline (e.g., "New", "Contacted", "Replied", "Interested").

**Where it lives in the UI:**
Settings → Pipeline tab.

**Status:** ✅ Complete

**Files involved:**
- `src/pages/SettingsPage.tsx` — Pipeline tab
- `src-tauri/src/lib.rs`

**Tauri commands used:**
- `get_statuses` — fetches all pipeline stages
- `create_status` — creates a new stage
- `update_status` — renames or recolors a stage
- `delete_status` — removes a stage (contacts using it have their status cleared)

**Database tables touched:**
- `statuses`

**Notes:**
Deleting a pipeline stage sets all contacts currently in that stage to no status. The user should reassign those contacts before deleting.

---

## 5. Tags

### Create and Manage Tags

**What it does for the user:**
Lets the user create colored labels (tags) to categorize contacts however they want — e.g., "VC", "Angel", "Warm Lead", "Follow Up".

**Where it lives in the UI:**
Contact detail page → Manage Tags button. Tag creation also available within that dialog.

**Status:** ✅ Complete

**Files involved:**
- `src/components/tags/ManageTagsDialog.tsx`
- `src-tauri/src/lib.rs`

**Tauri commands used:**
- `get_tags` — fetches all tags
- `create_tag` — creates a new tag with a name and color
- `update_tag` — renames or recolors a tag
- `delete_tag` — removes a tag entirely
- `assign_tag` — links a tag to a contact
- `unassign_tag` — removes a tag from a contact

**Database tables touched:**
- `tags`
- `contact_tags` — junction table linking contacts to tags

**Notes:**
Tags are visible on contact cards in both the table and kanban views. Tag-based filtering on the contacts page is not yet fully wired — it is on the post-launch roadmap.

---

## 6. Settings

### Connect Email Account (Gmail / Outlook)

**What it does for the user:**
Links the user's Gmail or Outlook account to OutreachOS so they can send and receive emails from within the app.

**Where it lives in the UI:**
Settings → Email Integration → Connect Gmail / Connect Outlook.

**Status:** ✅ Complete

**Files involved:**
- `src/components/settings/EmailSettingsTab.tsx`
- `src-tauri/src/lib.rs`
- `src-core/src/` — OAuth PKCE flow

**Tauri commands used:**
- `gmail_connect` — opens browser for Gmail OAuth, stores token on callback
- `outlook_connect` — opens browser for Outlook OAuth, stores token on callback
- `get_email_accounts` — lists connected accounts
- `delete_email_account` — disconnects an account
- `check_email_credentials` — checks if OAuth credentials file exists
- `save_email_credentials` — saves the OAuth client ID and secret

**Database tables touched:**
- `email_accounts` — stores connected account info and OAuth tokens

**Notes:**
OAuth tokens are encrypted with AES-256-GCM before being stored in the database. The user needs to provide their own OAuth client credentials (client ID and client secret from Google or Microsoft developer consoles) — OutreachOS does not provide shared credentials.

---

### Appearance Settings

**What it does for the user:**
Lets the user choose between light mode, dark mode, or system-matched theme, and pick an accent color for the app.

**Where it lives in the UI:**
Settings → Appearance tab.

**Status:** ✅ Complete

**Files involved:**
- `src/pages/SettingsPage.tsx`
- `src/components/providers/ThemeProvider.tsx`
- `src-tauri/src/lib.rs`

**Tauri commands used:**
- `get_settings` — loads current preferences
- `save_setting` — saves theme_mode and accent_color

**Database tables touched:**
- `settings` — `theme_mode` and `accent_color` keys

**Notes:**
None.

---

### Export and Clear Data

**What it does for the user:**
Lets the user export all their contacts and settings as a JSON file for backup, or permanently delete everything in the app.

**Where it lives in the UI:**
Settings → Data tab.

**Status:** ✅ Complete

**Files involved:**
- `src/pages/SettingsPage.tsx` — Data tab
- `src-tauri/src/lib.rs`

**Tauri commands used:**
- `export_all_data` — generates a full JSON export of contacts, statuses, and settings
- `clear_all_data` — permanently deletes all contacts, statuses, tags, and junction table entries

**Notes:**
Clear All Data is irreversible. The user is shown a confirmation dialog before this action proceeds.

---

## 7. Auth & Billing

### Connect OutreachOS Account (Clerk)

**What it does for the user:**
Links the user's OutreachOS cloud account (managed by Clerk) to the desktop app. This is required to use the commercial email tracking relay.

**Where it lives in the UI:**
Settings → Email Integration → Connect Account (or equivalent onboarding flow).

**Status:** 🔶 Partial

**Files involved:**
- `src-tauri/src/lib.rs` — deep link handler for `outreachos://` callback
- Clerk integration

**Tauri commands used:**
- _(Clerk auth commands — to be documented as Clerk integration is completed)_

**Database tables touched:**
- `settings` — `clerk_token` key (stored in OS keychain, not the DB)

**Notes:**
The Clerk auth flow uses a deep link callback (`outreachos://auth/callback`). The session token is stored exclusively in the OS keychain (macOS Keychain / Windows Credential Manager) — never in the SQLite database or any plaintext file. This feature is actively being built as part of Launch Phase 1.

---

## 8. Navigation & Layout

### Command Palette

**What it does for the user:**
A quick-access search bar the user can open from anywhere in the app with ⌘K. From it they can navigate to any page, add a contact, start an import, or trigger other common actions without using the mouse.

**Where it lives in the UI:**
⌘K keyboard shortcut from any page. Also accessible via the search bar in the top header.

**Status:** ✅ Complete

**Files involved:**
- `src/components/layout/CommandPalette.tsx`
- `src/components/layout/AppLayout.tsx`
- `src/components/layout/TopCommandBar.tsx`

**Tauri commands used:**
- None directly — triggers UI state changes

**Database tables touched:**
- None directly

**Notes:**
None.

---

### Notes Page

**What it does for the user:**
A dedicated page for managing notes. _(Full functionality not yet defined.)_

**Where it lives in the UI:**
Sidebar → Notes.

**Status:** 🔴 Placeholder

**Files involved:**
- `src/pages/NotesPage.tsx` — placeholder only

**Notes:**
Linked in the sidebar but contains no functionality. On the post-launch roadmap.

---

### Tasks Page

**What it does for the user:**
A dedicated page for managing tasks and reminders tied to contacts.

**Where it lives in the UI:**
Sidebar → Tasks.

**Status:** 🔴 Placeholder

**Files involved:**
- `src/pages/TasksPage.tsx` — placeholder only

**Notes:**
Linked in the sidebar but contains no functionality. On the post-launch roadmap.

---

### Templates Page

**What it does for the user:**
A place to create and manage reusable email templates tied to specific outreach stages.

**Where it lives in the UI:**
Sidebar → Templates.

**Status:** 🔴 Placeholder

**Files involved:**
- `src/pages/TemplatesPage.tsx` — placeholder only

**Notes:**
Linked in the sidebar but contains no functionality. On the post-launch roadmap.

---

### Dashboard

**What it does for the user:**
An overview page showing summary statistics — total contacts, contacts by pipeline stage, recent activity, emails sent, emails opened.

**Where it lives in the UI:**
Sidebar → Dashboard (home/root route `/`).

**Status:** 🔶 Partial

**Files involved:**
- `src/pages/DashboardPage.tsx` — scaffolding exists, not fully built

**Tauri commands used:**
- _(to be wired as Dashboard is completed)_

**Notes:**
The page file exists and some scaffolding is in place, but meaningful stats are not yet displayed. On the post-launch roadmap.

---

## Suspected Dead Code

This section lists code that exists in the codebase but appears to serve no active user-facing function. Dead code can confuse the AI agent and increase the risk of unintended side effects.

---

### AI Infrastructure in `outreach-core`

**Location:** `src-core/src/` — `AiClient` and `EnrichmentEngine` structs

**What it is:** Client code and enrichment logic for connecting to AI providers (Gemini, OpenRouter). Was used by Magic Paste, AI Enrichment, and AI Email Drafting features.

**Why it's suspected dead:**
- All AI-facing Tauri commands (`scrape_clipboard`, `magic_paste`, `enrich_contact_cmd`) were deleted from `lib.rs` in v0.1.1
- `ai.rs` and `email_ai.rs` were physically removed from the filesystem
- The core structs remain in `outreach-core` but are not called by any active command

**Recommended action:** **Keep intentionally** — `AiClient` and `EnrichmentEngine` are planned for re-enablement in v0.2 as opt-in BYOK (bring your own API key) features. Do not delete. Document clearly so future AI agents do not remove them.

---

### `arboard` Clipboard Crate

**Location:** `src-tauri/Cargo.toml` dependency

**What it is:** A Rust crate for reading and writing the system clipboard. Was used by the removed `scrape_clipboard` command (Magic Paste).

**Why it's suspected dead:**
- The only command that used it (`scrape_clipboard`) has been deleted
- No active Tauri commands reference `arboard`

**Recommended action:** **Investigate then remove** — verify with `grep -r "arboard" src-tauri/src/`. If no active code references it, remove from `Cargo.toml` to reduce binary size and compilation time.

---

### Legacy `status` Column on Contacts Table

**Location:** `contacts` table in SQLite, `contacts.status` TEXT column

**What it is:** An older plain-text status field that predates the current `statuses` table and `status_id` foreign key system.

**Why it's suspected dead:**
- All active display code uses `status_id` with a JOIN on the `statuses` table
- The column is written to in `update_contact` for backward compatibility sync but is never read for display purposes

**Recommended action:** **Keep for now, schedule future removal** — safe to remove after verifying no external tooling or exported data depends on it. Add to the v0.3 cleanup list.

---

### Legacy AI Settings Keys in Database

**Location:** `settings` table — keys `ai_provider`, `ai_model`, `ai_base_url`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`

**What it is:** Settings keys that stored AI provider configuration when AI features were active.

**Why it's suspected dead:**
- The AI Settings tab was removed from the UI in v0.1.1
- No active UI reads or writes these keys
- They exist in the database schema but are inert

**Recommended action:** **Keep intentionally** — these keys will be re-used when BYOK AI features are re-enabled in v0.2. Do not remove from the schema. The UI to expose them will be re-added at that time.
