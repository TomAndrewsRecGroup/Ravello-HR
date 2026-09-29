-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 5, Group 10: final QA fix — environmental_aspects
-- had the same unguarded manual supersede as emergency_plans (165)
-- (2026-09-29)
-- ═══════════════════════════════════════════════════════════════════
--
-- Same adversarial concurrency testing as 164/165. Migration 156's own
-- comment documents the discipline as "a material change is a NEW
-- ROW. The old row flips to 'superseded' via its own UPDATE" — but
-- environmental_aspects_stamp() (156) only ever validated the
-- cross-organisation reference, never performed or guarded the
-- supersede itself. Reproduced live (rolled back): two sequential
-- INSERTs, the second naming the first via supersedes_id, with no
-- separate UPDATE — both rows stay non-superseded indefinitely.
--
-- Unlike 165 (emergency_plans), no current admin UI path sets
-- supersedes_id on insert for this table yet
-- (EnvironmentalAspectsClient.tsx has no "new version" action) — so
-- this is a defensive, not-yet-reachable-through-the-product fix,
-- applied for the same reason every H&S workflow guard in this
-- codebase lives in a trigger rather than the UI: the database should
-- hold the invariant regardless of which UI path (today's or a later
-- group's) ends up writing to it.
--
-- Fix: an AFTER INSERT trigger, the identical shape to
-- emergency_plans_supersede_roll() (165) — supersede the named parent
-- AND any sibling already non-superseded off the same supersedes_id,
-- the moment a new version lands. Guarded to never touch a row already
-- 'superseded' (so it cannot resurrect or double-fire), matching the
-- exact defensive shape environmental_aspect_assessments_roll() (156)
-- already uses for the SAME table's assessment-driven status roll —
-- this trigger and that one are independent and do not conflict: this
-- one only ever moves a row TO 'superseded' on version supersession;
-- that one only ever sets 'confirmed_significant'/
-- 'confirmed_not_significant' on a non-superseded row.
--
-- Idempotent. Safe to re-run.

CREATE OR REPLACE FUNCTION public.environmental_aspects_supersede_roll()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.supersedes_id IS NOT NULL THEN
    UPDATE public.environmental_aspects
    SET status = 'superseded'
    WHERE id = NEW.supersedes_id
      AND status <> 'superseded';

    -- Sibling race: a different version created off the SAME parent
    -- that landed first (or concurrently) is no longer current.
    UPDATE public.environmental_aspects
    SET status = 'superseded'
    WHERE supersedes_id = NEW.supersedes_id
      AND id <> NEW.id
      AND status <> 'superseded';
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.environmental_aspects_supersede_roll() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS environmental_aspects_supersede_roll ON public.environmental_aspects;
CREATE TRIGGER environmental_aspects_supersede_roll
AFTER INSERT ON public.environmental_aspects
FOR EACH ROW EXECUTE FUNCTION public.environmental_aspects_supersede_roll();
