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

## Phase 3 — Bug Fixes (Pending)

### 3.1 Scheduler race condition
- **File:** `src-tauri/src/scheduler.rs`
- **Problem:** The scheduler spawns threads for email sending without proper synchronization. If the app closes while emails are being sent, threads may be orphaned or data may be partially written
- **Fix:** Add proper thread joining on shutdown, use `tokio::task::JoinHandle` instead of bare `std::thread`, and add a shutdown flag (`AtomicBool`) that threads check before committing
- **Risk:** Medium — touches async/threading logic

### 3.2 File deletion order
- **File:** `src-tauri/src/lib.rs` (related to file/contact deletion commands)
- **Problem:** When deleting contacts or files, dependent records (contact_events, contact_tags, email associations) may not be cleaned up in the correct order, potentially leaving orphaned records
- **Fix:** Ensure cascading deletes happen in the correct order: dependent tables first, then the parent record. Add explicit `DELETE FROM contact_events WHERE contact_id = ?` and `DELETE FROM contact_tags WHERE contact_id = ?` before `DELETE FROM contacts WHERE id = ?` if not already handled by foreign key constraints
- **Risk:** Medium — data integrity concern

### 3.3 Import error swallowing
- **File:** `src-tauri/src/lib.rs` (`import_contacts` function)
- **Problem:** During bulk import, if a single contact insert fails, the error is silently ignored (`if result.is_ok() { count += 1; }`). The user gets a success count but has no idea some contacts failed
- **Fix:** Track failed inserts separately and return a richer result: `{ imported: usize, skipped: usize, failed: usize, errors: Vec<String> }`. Show failures in the UI
- **Risk:** Medium — changes the return type, requires frontend update

### 3.4 Update check rate limiting
- **File:** `src-tauri/src/lib.rs` or related update checking code
- **Problem:** The `check_for_updates` command (or equivalent) may be called too frequently without client-side rate limiting, potentially hitting GitHub API rate limits or causing unnecessary network requests
- **Fix:** Add a simple in-memory cache with a TTL (e.g., 1 hour) so repeated calls within the window return the cached result instead of hitting the network
- **Risk:** Low

---

## Phase 4 — Data Integrity (Pending)

### 4.1 Expand `export_all_data` scope
- **File:** `src-tauri/src/lib.rs` (`export_all_data_to_path` command)
- **Current scope:** Contacts, statuses, tags
- **Missing:** May not include contact_events, email_accounts, email_templates, email_signatures, settings, contact_tags junction data
- **Fix:** Audit the export function and ensure ALL user data tables are included. Add a version field to the export format for future compatibility
- **Risk:** Medium — changes export format

### 4.2 Expand `clear_all_data` scope
- **File:** `src-tauri/src/lib.rs` (`clear_all_data` command)
- **Current scope:** Contacts, statuses, tags (based on the confirmation dialog text)
- **Missing:** May not clear contact_events, email-related tables, settings, or other auxiliary data
- **Fix:** Audit and ensure ALL user data tables are cleared. Update the confirmation dialog text to accurately reflect what gets deleted
- **Risk:** Medium — destructive operation, must be correct

---

## Phase 5 — Placeholder Pages (Pending — UX Decision Needed)

### 5.1 NotesPage
- **File:** `src/pages/NotesPage.tsx`
- **Current state:** Placeholder/empty page with no functionality
- **Options:**
  1. **Remove** — delete the route, sidebar link, and file entirely
  2. **Keep as placeholder** — leave it but mark as "Coming Soon" with a clear UX
  3. **Build minimal v1** — implement basic note CRUD with contact linking
- **Decision needed from you**

### 5.2 TasksPage
- **File:** `src/pages/TasksPage.tsx`
- **Current state:** Placeholder/empty page with no functionality
- **Options:**
  1. **Remove** — delete the route, sidebar link, and file entirely
  2. **Keep as placeholder** — leave it but mark as "Coming Soon" with a clear UX
  3. **Build minimal v1** — implement basic task CRUD with contact linking and due dates
- **Decision needed from you**

---

## Phase 6 — Schema Cleanup (Pending — Highest Risk)

### 6.1 Drop dead tables
- **Audit needed:** Identify tables that exist in the database but are never queried by any command
- **Likely candidates:** Tables created in early migrations that were later abandoned
- **Fix:** Create a new migration that drops these tables with `IF EXISTS` guards
- **Risk:** High — irreversible schema change

### 6.2 Clean up `is_default` column (optional)
- **Table:** `statuses`
- **Column:** `is_default BOOLEAN DEFAULT FALSE`
- **Status:** After Phase 2.6, this column is never read — default is determined by `position ASC`
- **Options:**
  1. **Leave it** — harmless, could be useful if explicit default control is added later
  2. **Remove it** — cleaner schema, requires a migration
- **Decision:** Leave it for now (your call)

### 6.3 Clean up legacy `status` text column (optional)
- **Table:** `contacts`
- **Column:** `status TEXT` — the legacy text status, now superseded by `status_id TEXT REFERENCES statuses(id)`
- **Status:** Still written to for backward compatibility but the UI reads from `status_id`
- **Options:**
  1. **Leave it** — safety net during transition
  2. **Remove it** — requires verifying all reads use `status_id`, then dropping the column
- **Decision:** Defer — requires careful audit of all status reads

---

## Execution Order & Dependencies

```
Phase 1 ✅ (done)
  ↓
Phase 2 ✅ (done)
  ↓
Phase 3 (bug fixes — independent items, can be done in any order)
  ↓
Phase 4 (data integrity — depends on Phase 3 being clean)
  ↓
Phase 5 (placeholder pages — independent, but needs your decision)
  ↓
Phase 6 (schema cleanup — highest risk, should be done last)
```

## Risk Summary

| Phase | Risk Level | Reason |
|---|---|---|
| 1 | None | Dead code removal only |
| 2 | Low | Replaces hardcoded values, fixes UI inconsistencies |
| 3 | Medium-High | Touches threading, error handling, data flow |
| 4 | Medium | Changes export/clear scope — must be correct |
| 5 | Low | Depends on your decision (remove vs. build) |
| 6 | High | Irreversible schema changes |

## Outstanding Decisions Needed From You

1. **NotesPage & TasksPage** — Remove, keep as "Coming Soon", or build minimal v1?
2. **Phase 6 `is_default` column** — Leave it (current plan) or remove?
3. **Phase 6 `status` text column** — Leave it or remove?
4. **Execution approach** — Tackle remaining phases all at once, or phase-by-phase with review checkpoints?
