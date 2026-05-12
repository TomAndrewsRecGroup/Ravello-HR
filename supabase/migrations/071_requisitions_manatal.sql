-- ═══════════════════════════════════════════════════════════
-- Phase 72: Manatal job link on requisitions
--
-- When an admin clicks "Publish to Manatal" on a requisition we
-- create a Manatal job under the client's organization and store
-- the returned id here so the UI can show the live link, prevent
-- duplicate publishes, and support a "re-publish" flow later.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS manatal_job_id       TEXT,
  ADD COLUMN IF NOT EXISTS manatal_published_at TIMESTAMPTZ;
