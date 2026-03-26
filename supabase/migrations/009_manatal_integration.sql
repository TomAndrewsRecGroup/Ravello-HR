-- ══════════════════════════════════════════════════════════════
--  Migration 009: Manatal ATS Integration
--  Add manatal_client_id to companies for linking to Manatal.
--  Admin sets this when converting/creating a client.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS manatal_client_id TEXT;  -- Manatal department/client ID

COMMENT ON COLUMN companies.manatal_client_id IS
  'Manatal ATS department or client ID. When set, the portal HIRE section can display live pipeline data from Manatal.';
