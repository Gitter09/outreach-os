# JobDex Cleanup Plan

Comprehensive 6-phase cleanup plan for the JobDex codebase (Tauri 2 + React 19 + Rust + SQLCipher personal CRM).

---

## Phase 1 — Dead Code Removal ✅ COMPLETE

### 1.1 Remove unused `regex` dependency
- **File:** `src-core/Cargo.toml`
- **Change:** Remove `regex = "1.12.2"` — zero usages anywhere in the codebase
- **Risk:** None

### 1.2 Remove dead AI fields from settings provider
- **File:** `src/components/providers/settings-provider.tsx`
- **Change:** Remove 4 dead AI fields from the `Settings` interface: `ai_provider`, `ai_model`, `ai_base_url`, `ai_temperature`
- **Reason:** No UI, no backend, no references — pure dead code
- **Risk:** None

### 1.3 Remove unused `Company` struct
- **File:** `src-core/src/db.rs`
- **Change:** Remove the `Company` struct — never queried by any Tauri command
- **Risk:** None

### 1.4 Update onboarding status in agent.md
- **File:** `.agent/agent.md`
- **Change:** Update onboarding status from "🔶 Not built" → "✅ Complete"
- **Risk:** None

**Verification:** `cargo check` ✅ | `npx tsc --noEmit` ✅

---

## Phase 2 — Inconsistency Fixes ✅ COMPLETE

### 2.1 Remove stale comment in `delete_status`
- **File:** `src-tauri/src/lib.rs` (lines ~222-224)
- **Before:** 3-line comment debating what to do with orphaned contacts — the code already does the right thing
- **After:** Comment removed
- **Risk:** None

### 2.2 Replace `window.confirm()` with `AlertDialog`
- **File:** `src/pages/SettingsPage.tsx` (line ~186)
- **Before:** Native `confirm()` dialog for "Clear All Data"
- **After:** New `AlertDialog` with `clearDialogOpen` state, matching the existing backup restore dialog pattern. Title: "Clear all data?", Description: "This will delete all contacts, statuses, and tags. This action cannot be undone. Your settings and API keys will remain untouched."
- **User impact:** Consistent confirmation experience across all destructive actions
- **Risk:** Low

### 2.3 Fix "VCReach" string leak
- **File:** `src/pages/ContactsPage.tsx` (line ~492)
- **Before:** `"VCReach Personalizer Ready"` as fallback text when contact has no title/company
- **After:** `"Add title or company"` — product-agnostic placeholder
- **User impact:** Removes legacy branding from the UI
- **Risk:** None

### 2.4 Fix `import_contacts` hardcoded status
- **File:** `src-tauri/src/lib.rs` (lines ~1902-1929)
- **Before:** Every imported contact gets hardcoded `status="New"`, `status_id="stat-new"` — the ID `"stat-new"` doesn't match the actual seeded ID `"def-stat-001"`, creating dangling references
- **After:** Queries `SELECT id, label FROM statuses ORDER BY position ASC LIMIT 1` to use the actual top-position status. Falls back to `("Imported", "")` if no statuses exist
- **User impact by scenario:**
  - Untouched statuses: no visible change, data stops being corrupt
  - Deleted "New": contacts land in correct status instead of ghost reference
  - Renamed "New": label matches what user sees
  - Custom statuses: imports respect user's pipeline
- **Risk:** Low

### 2.5 Fix `update_contacts_status_bulk` — sync legacy `status` column
- **File:** `src-tauri/src/lib.rs` (lines ~1951-1975)
- **Before:** Only updates `status_id`, leaving the legacy `status` text column out of sync
- **After:** Fetches the status label via `SELECT label FROM statuses WHERE id = ?`, then updates both columns: `UPDATE contacts SET status_id = ?, status = COALESCE(?, status) WHERE id = ?`
- **User impact:** Bulk status changes now correctly update both columns, preventing UI/data mismatches
- **Risk:** Low

### 2.6 Change default status resolution to position-based
- **Files:** `src-tauri/src/lib.rs` (3 locations)
  1. `add_contact` fallback query (line ~305)
  2. `fix_status_orphans` fallback query (line ~697)
  3. `import_contacts` insert query (line ~1905) — covered in 2.4
- **Before:** `ORDER BY is_default DESC, position ASC` — relies on `is_default` column which has no UI to control
- **After:** `ORDER BY position ASC` — whichever status is at the top of the list is the default
- **User impact:** Power users can change their default status by reordering — no extra settings UI needed
- **Risk:** Low

**Verification:** `cargo check` ✅ | `npx tsc --noEmit` ✅

---

## Phase 3 — Bug Fixes ✅ COMPLETE

### 3.1 Scheduler race condition
- **File:** `src-tauri/src/scheduler.rs`
- **Before:** Scheduler runs in a fire-and-forget loop with no shutdown mechanism. If the app closes mid-send, the task is orphaned.
- **After:** Added `AtomicBool` shutdown flag (`SHUTDOWN_FLAG`). Scheduler checks it each tick and breaks cleanly. `stop_email_scheduler()` is called when the app exits via tray close.
- **User impact:** Clean shutdown — no orphaned threads, no partially-written email data
- **Risk:** Medium — touches async/threading logic

### 3.2 Contact deletion order (cascading deletes)
- **File:** `src-tauri/src/lib.rs` (`delete_contact` command, lines ~730-755)
- **Before:** Only deleted from `contacts` table, leaving orphaned records in `contact_events`, `contact_tags`, `contact_files`, and `scheduled_emails`. No FK constraints exist to enforce this.
- **After:** Wraps in a transaction and cascades in correct dependency order: `contact_events` → `contact_tags` → `contact_files` → `scheduled_emails` → `contacts`
- **User impact:** Deleting a contact now fully cleans up all associated data — no orphaned records
- **Risk:** Medium — data integrity concern

### 3.3 Import error swallowing
- **File:** `src-tauri/src/lib.rs` (`import_contacts` function, lines ~1821-1953)
- **Before:** Insert errors silently ignored with `if result.is_ok() { count += 1; }`. User only saw a total count with no idea some contacts failed.
- **After:** New `ImportResult` struct with `imported`, `skipped`, `merged`, `failed`, and `errors` fields. Frontend displays full breakdown with error details.
- **User impact:** User now sees "3 imported, 2 merged, 1 skipped, 2 failed" with specific error messages for each failure
- **Risk:** Medium — changes the return type, required frontend update

### 3.4 Update check rate limiting
- **File:** `src-tauri/src/lib.rs` (`check_for_update` command, lines ~2445-2515)
- **Before:** Every call hits GitHub API directly — no caching, risks hitting rate limits.
- **After:** Added `Mutex<Option<(String, Instant)>>` in-memory cache with 1-hour TTL. Repeated calls within the window return the cached result.
- **User impact:** Faster response for repeated checks, no risk of GitHub API rate limiting
- **Risk:** Low

**Verification:** `cargo check` ✅ | `npx tsc --noEmit` ✅

---

## Phase 4 — Data Integrity ✅ COMPLETE

### 4.1 Expand `export_all_data` scope (5 → 13 tables)
- **File:** `src-tauri/src/lib.rs` (`export_all_data` command, lines ~1363-1619)
- **Before:** Only exported contacts, statuses, tags, contact_tags, settings
- **After:** Now also exports: contact_events, contact_files, email_accounts, email_threads, email_messages, email_attachments, scheduled_emails, email_templates, email_signatures
- **Export version:** Bumped from `1.1` → `1.2`
- **User impact:** Backups now capture the full state of the CRM including email subsystem data
- **Risk:** Medium — changes export format (backward-compatible, old versions still readable)

### 4.2 Expand `clear_all_data` scope (4 → 13 tables)
- **File:** `src-tauri/src/lib.rs` (`clear_all_data` command, lines ~1344-1380)
- **Before:** Only cleared contacts, statuses, tags, contact_tags
- **After:** Now also clears: contact_events, contact_files, email_accounts, email_threads, email_messages, email_attachments, scheduled_emails, email_templates, email_signatures
- **Intentionally NOT cleared:** `settings` — user keeps their config on reset
- **Delete order:** Dependents first, then parents (avoids orphaned records since no FK constraints)
- **User impact:** Factory reset now truly resets everything except app settings
- **Risk:** Medium — destructive operation

### 4.3 Expand `import_all_data` scope (5 → 9 tables)
- **File:** `src-tauri/src/lib.rs` (`import_all_data` command, lines ~1646-2020)
- **Before:** Only restored statuses, tags, contacts, contact_tags, settings
- **After:** Now also restores: contact_events, email_templates, email_signatures, scheduled_emails
- **Intentionally NOT restored:** email_accounts, email_threads, email_messages, email_attachments — contain OAuth tokens and message data that shouldn't be blindly merged from backup (security + referential integrity)
- **Version support:** Extended to `1.2`
- **ImportSummary:** Expanded with `eventsRestored`, `templatesRestored`, `signaturesRestored`, `scheduledRestored`
- **User impact:** Restoring from backup now recovers more of the user's data
- **Risk:** Medium

### 4.4 UI updates
- **`src/types/crm.ts:119`** — `ImportSummary` interface expanded with 4 new fields
- **`src/pages/SettingsPage.tsx:216-230`** — Toast now shows full breakdown of what was restored
- **`src/pages/SettingsPage.tsx:295, 281`** — Confirmation dialog and card text updated to accurately reflect the expanded scope
- **User impact:** Clear, accurate messaging about what gets deleted/restored

**Verification:** `cargo check` ✅ | `npx tsc --noEmit` ✅

---

## Phase 5 — Placeholder Pages ⏭️ SKIPPED

### 5.1 NotesPage
- **File:** `src/pages/NotesPage.tsx`
- **Decision:** Leave as-is. No code changes.

### 5.2 TasksPage
- **File:** `src/pages/TasksPage.tsx`
- **Decision:** Leave as-is. No code changes.

---

## Phase 6 — Schema Cleanup ✅ COMPLETE

### 6.1 Drop dead tables ✅
- **File:** `src-core/migrations/20260407000002_drop_dead_tables.sql`
- **Tables dropped:** `companies`, `campaigns`, `applications`, `interactions`
- **Reason:** Created in `20260121000000_init.sql` but never referenced by any Tauri command — zero reads, zero writes
- **Verification:** Grep across `src-tauri/src/` confirms no references to any of these four tables
- **Risk:** High — irreversible, but mitigated by `IF EXISTS` guards and confirmed zero usage
- **User impact:** None — these tables were never used

### 6.2 Clean up `is_default` column
- **Decision:** Leave it — harmless, could be useful if explicit default control is added later

### 6.3 Clean up legacy `status` text column
- **Decision:** Leave it — safety net during transition

---

## Execution Order & Dependencies

```
Phase 1 ✅ (done)
  ↓
Phase 2 ✅ (done)
  ↓
Phase 3 ✅ (done)
  ↓
Phase 4 ✅ (done)
  ↓
Phase 5 ⏭️ (skipped — leave as-is per user decision)
  ↓
Phase 6 ✅ (done — dropped 4 dead tables)
```

## Risk Summary

| Phase | Risk Level | Reason |
|---|---|---|
| 1 | None | Dead code removal only |
| 2 | Low | Replaces hardcoded values, fixes UI inconsistencies |
| 3 | Medium-High | Touches threading, error handling, data flow |
| 4 | Medium | Changes export/clear scope — must be correct |
| 5 | N/A | Skipped — no changes |
| 6 | High | Irreversible schema changes (mitigated by `IF EXISTS`) |

## All Phases Complete ✅

No outstanding decisions remain. The cleanup is done.
