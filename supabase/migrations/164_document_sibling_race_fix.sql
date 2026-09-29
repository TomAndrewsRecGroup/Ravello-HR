-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 5, Group 10: final QA fix — a real concurrency gap
-- found while adversarially testing hs_documents' versioning discipline
-- (2026-09-29)
-- ═══════════════════════════════════════════════════════════════════
--
-- Migration 160's own rule 7 says: "This keeps exactly one document
-- 'current' at any time." Reproduced live that this was FALSE: if two
-- people independently start a new version off the SAME currently-
-- active parent (two INSERTs both naming the same supersedes_id — the
-- realistic "two editors, one document" race this task's concurrency
-- test asked for), and BOTH reach 'active', hs_document_supersede_roll()
-- (160) only ever superseded the NAMED parent — never the sibling. Both
-- ended up 'active' simultaneously. Reproduced 2/2 before this fix
-- (check2_BUG_both_siblings_active_simultaneously = true); fixed and
-- re-proved 4/4 after (supabase/probes/164_document_sibling_race.sql).
--
-- Fix: when NEW reaches 'active', ALSO supersede any OTHER row sharing
-- the same supersedes_id that is still 'active' — the sibling that lost
-- the race. A normal linear chain (v1 -> v2 -> v3, no siblings) is
-- unaffected, proven in the same probe (check4).
--
-- Idempotent. Safe to re-run.

CREATE OR REPLACE FUNCTION public.hs_document_supersede_roll()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'active' AND OLD.status IS DISTINCT FROM 'active' THEN
    IF NEW.supersedes_id IS NOT NULL THEN
      UPDATE public.hs_documents
      SET status = 'superseded'
      WHERE id = NEW.supersedes_id
        AND status IN ('active', 'review_due', 'approved');

      -- Sibling race: another version created off the SAME parent that
      -- reached active first (or concurrently) is no longer current.
      UPDATE public.hs_documents
      SET status = 'superseded'
      WHERE supersedes_id = NEW.supersedes_id
        AND id <> NEW.id
        AND status = 'active';
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.hs_document_supersede_roll() FROM PUBLIC, anon, authenticated;
