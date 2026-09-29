-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 5, Group 10: final QA fix — emergency_plans had no
-- automated supersede at all (2026-09-29)
-- ═══════════════════════════════════════════════════════════════════
--
-- Continuing the same concurrency/correctness testing that found the
-- hs_documents sibling race (164). Group 11's own migration comment
-- (154) documents the versioning discipline as: "insert the new row
-- first... then update the old row to superseded... never the
-- reverse" — but that second write has ALWAYS been a plain client-side
-- UPDATE from the admin UI (EmergencyPlansClient.tsx), with NO trigger
-- on emergency_plans enforcing it. Unlike hs_documents (160), which at
-- least had an automated (if buggy, until 164) roll-forward trigger,
-- emergency_plans had none — reconciliation depended entirely on the
-- UI's second call actually running.
--
-- Reproduced live (rolled back): two sequential INSERTs, the second
-- naming the first via supersedes_id, BOTH status='active', with no
-- separate UPDATE — exactly what happens if a dropped connection,
-- a crash, or simply a different write path skips the second step.
-- Result: 2 active rows in the same plan_type lineage, permanently,
-- since nothing ever reconciles it afterwards. This is a superset of
-- the hs_documents defect: there it took a genuine race between two
-- submitters; here a single ordinary partial failure is enough.
--
-- Fix: an AFTER INSERT trigger, the same "one lineage, one active row"
-- shape as hs_document_supersede_roll() (164) but adapted to this
-- table's simpler active/superseded-only lifecycle (no draft/review/
-- approval states to gate on) — supersede the named parent AND any
-- sibling already active off the same supersedes_id, the moment the
-- new version lands. The admin UI's own second UPDATE call is now
-- redundant (idempotent, harmless) rather than load-bearing; it is
-- left in place rather than removed, since removing it is not
-- required to close the gap and a second, independent guard is a
-- reasonable defence in depth for a page that writes with a plain
-- client session under RLS, not a service role.
--
-- Idempotent. Safe to re-run.

CREATE OR REPLACE FUNCTION public.emergency_plans_supersede_roll()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'active' AND NEW.supersedes_id IS NOT NULL THEN
    UPDATE public.emergency_plans
    SET status = 'superseded'
    WHERE id = NEW.supersedes_id
      AND status = 'active';

    -- Sibling race: a different version created off the SAME parent
    -- that reached active first (or concurrently) is no longer current.
    UPDATE public.emergency_plans
    SET status = 'superseded'
    WHERE supersedes_id = NEW.supersedes_id
      AND id <> NEW.id
      AND status = 'active';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.emergency_plans_supersede_roll() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS emergency_plans_supersede_roll ON public.emergency_plans;
CREATE TRIGGER emergency_plans_supersede_roll
AFTER INSERT ON public.emergency_plans
FOR EACH ROW EXECUTE FUNCTION public.emergency_plans_supersede_roll();
