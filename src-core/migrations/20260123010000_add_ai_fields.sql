-- Add AI insights columns
ALTER TABLE contacts ADD COLUMN ai_talking_points TEXT;
ALTER TABLE contacts ADD COLUMN ai_company_intel TEXT;
ALTER TABLE contacts ADD COLUMN ai_last_analyzed DATETIME;
ALTER TABLE contacts ADD COLUMN ai_profile_version INTEGER DEFAULT 0;
