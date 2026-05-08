-- ═══════════════════════════════════════════════════════════
-- Phase 70: IvyLens dismiss list
--
-- IvyLens leads are synthesised on each page load from the live
-- /bd/leads API. The previous "delete" UI dropped them from local
-- state only — they reappeared on the next refresh because the
-- source feed kept including them.
--
-- This table stores the synthetic ids (e.g. 'ivylens-…' for a
-- company or 'ivylens-…-role-N' for a role) admins have explicitly
-- dismissed, so the BD pages can filter them out of every render.
--
-- TPS staff only — no client portal exposure.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bd_ivylens_dismissed (
  synthetic_id  TEXT PRIMARY KEY,
  kind          TEXT NOT NULL CHECK (kind IN ('company', 'role')),
  dismissed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  dismissed_by  UUID REFERENCES profiles(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS bd_ivylens_dismissed_kind_idx ON bd_ivylens_dismissed(kind);

ALTER TABLE bd_ivylens_dismissed ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT polname FROM pg_policy
     WHERE polname IN ('bd_ivylens_dismissed_staff_all')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON bd_ivylens_dismissed', pol.polname);
  END LOOP;
END $$;

CREATE POLICY bd_ivylens_dismissed_staff_all ON bd_ivylens_dismissed
  FOR ALL TO authenticated
  USING      ((SELECT public.is_tps_staff()))
  WITH CHECK ((SELECT public.is_tps_staff()));
