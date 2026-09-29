-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 4, Group 5 fix: PUWER review date rolls forward onto
-- the asset (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- Found while wiring the reminder rule for 148: `puwer_assessments` is
-- insert-only (a correction is a new assessment), so a reminder rule
-- reading that table DIRECTLY would fire once per HISTORICAL row —
-- every past assessment's `review_due_on`, not just the current one.
-- `hs_equipment_inspections` (114) already solved exactly this shape by
-- rolling `last_inspected_on`/`next_inspection_due` forward onto the
-- PARENT `hs_equipment` row, and reading reminders from THAT column —
-- this mirrors it precisely rather than inventing a second pattern.
--
-- `hs_equipment.puwer_review_due_on` is the one column reminders read.
-- The roll only advances it when this is the NEWEST assessment for the
-- asset (by `assessed_on`, ties broken by `created_at`) — an old
-- assessment entered late (backfilled) never moves a newer one
-- backwards, the same rule `hs_equipment_inspection_roll()` already
-- follows.

ALTER TABLE public.hs_equipment ADD COLUMN IF NOT EXISTS puwer_review_due_on date;
CREATE INDEX IF NOT EXISTS hs_equipment_puwer_review_due_idx ON public.hs_equipment (puwer_review_due_on) WHERE puwer_review_due_on IS NOT NULL;

CREATE OR REPLACE FUNCTION public.puwer_assessment_roll()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.hs_equipment eq
     SET puwer_review_due_on = NEW.review_due_on, updated_at = now()
   WHERE eq.id = NEW.asset_id
     AND NOT EXISTS (
       SELECT 1 FROM public.puwer_assessments p
        WHERE p.asset_id = NEW.asset_id AND p.id <> NEW.id
          AND (p.assessed_on > NEW.assessed_on
               OR (p.assessed_on = NEW.assessed_on AND p.created_at > NEW.created_at))
     );
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.puwer_assessment_roll() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS puwer_assessments_roll ON public.puwer_assessments;
CREATE TRIGGER puwer_assessments_roll
  AFTER INSERT ON public.puwer_assessments
  FOR EACH ROW EXECUTE FUNCTION public.puwer_assessment_roll();
