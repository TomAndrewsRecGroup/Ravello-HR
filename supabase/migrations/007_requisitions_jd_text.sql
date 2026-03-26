-- ══════════════════════════════════════════════════════════════
--  Migration 007: Add jd_text to requisitions
--  Stores the raw job description text submitted via the
--  IvyLens / Friction Lens form on the new requisition page.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS jd_text TEXT;
