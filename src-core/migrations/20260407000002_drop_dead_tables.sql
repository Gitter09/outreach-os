-- Phase 6.1: Drop dead tables that are never queried by any Tauri command.
-- These were created in the initial migration (20260121000000_init.sql)
-- but were abandoned as the product scope evolved.
--
-- Tables dropped:
--   - companies: No command reads or writes to this table
--   - campaigns: No command reads or writes to this table
--   - applications: No command reads or writes to this table
--   - interactions: No command reads or writes to this table

DROP TABLE IF EXISTS companies;
DROP TABLE IF EXISTS campaigns;
DROP TABLE IF EXISTS applications;
DROP TABLE IF EXISTS interactions;
