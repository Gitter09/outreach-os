-- Drop dead columns from contacts table using table rebuild.
-- ALTER TABLE DROP COLUMN fails when the column has a FK constraint,
-- even if the referenced table was already dropped (dangling FK).
-- Columns being removed:
--   - company_id: FK to companies (table dropped in 20260407000002)
--   - status: legacy text column, replaced by status_id
--   - ai_talking_points, ai_company_intel, ai_last_analyzed, ai_profile_version:
--     AI features removed in v0.1.1

-- Rebuild approach: create new table without dead columns, copy data, swap.

-- Step 1: Create new table with only the columns we want to keep
CREATE TABLE contacts_new (
    id TEXT PRIMARY KEY NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    email TEXT,
    linkedin_url TEXT,
    intelligence_summary TEXT,
    title TEXT,
    company TEXT,
    location TEXT,
    company_website TEXT,
    status_id TEXT REFERENCES statuses(id),
    last_interaction_at DATETIME,
    last_contacted_date DATETIME,
    next_contact_date DATETIME,
    cadence_stage INTEGER DEFAULT 0,
    next_contact_event TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Step 2: Copy existing data (only the columns we keep; dead columns are left behind)
INSERT INTO contacts_new (
    id, first_name, last_name, email, linkedin_url, intelligence_summary,
    title, company, location, company_website, status_id,
    last_interaction_at, last_contacted_date, next_contact_date,
    cadence_stage, next_contact_event, created_at, updated_at
)
SELECT
    id, first_name, last_name, email, linkedin_url, intelligence_summary,
    title, company, location, company_website, status_id,
    last_interaction_at, last_contacted_date, next_contact_date,
    cadence_stage, next_contact_event, created_at, updated_at
FROM contacts;

-- Step 3: Drop old table
DROP TABLE contacts;

-- Step 4: Rename new table
ALTER TABLE contacts_new RENAME TO contacts;