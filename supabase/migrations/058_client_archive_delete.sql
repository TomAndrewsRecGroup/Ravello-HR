-- ═══════════════════════════════════════════════════════════
-- Phase 58: Client archive / delete support
--
-- archived_at = soft-archive marker. Companies stay in Supabase
-- with all data intact, but disappear from admin lists, the client
-- switcher, hiring/reporting selectors, etc., and their portal
-- users cannot log in. Setting archived_at also flips active=false
-- so existing `eq('active', true)` filters keep working.
--
-- Hard deletes (full wipe) are handled in the application layer
-- via /api/clients/[id] DELETE: it deletes auth.users for every
-- profile in the company (cascades the profile row), strips a few
-- non-cascade refs (data_access_requests), then deletes the company
-- which cascades every other table on company_id.
--
-- Backfill: every existing row is unarchived (NULL).
-- ═══════════════════════════════════════════════════════════

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_companies_archived_at
  ON companies (archived_at) WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_companies_active_not_archived
  ON companies (id) WHERE active = true AND archived_at IS NULL;

-- data_access_requests references companies(id) without ON DELETE
-- behaviour, which would block a hard client delete. Switch to
-- CASCADE so the application-level wipe works without a manual
-- delete on this table.
DO $$
BEGIN
  ALTER TABLE data_access_requests
    DROP CONSTRAINT IF EXISTS data_access_requests_company_id_fkey;
  ALTER TABLE data_access_requests
    ADD CONSTRAINT data_access_requests_company_id_fkey
    FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;
EXCEPTION WHEN undefined_table THEN
  -- Table doesn't exist in this environment yet; skip.
  NULL;
END $$;
