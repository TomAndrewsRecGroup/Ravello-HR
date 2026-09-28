-- ═══════════════════════════════════════════════════════════════════
-- Core-OS 360 Phase 4, Group 6: LOLER thorough examinations + immediate
-- danger (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- A LOLER thorough examination is a single dated PASS/FAIL event with a
-- next-due date — exactly the shape `hs_equipment_inspections` (114)
-- already has, and NOT a checklist (unlike Group 3's `inspections` or
-- Group 5's PUWER assessments, which may optionally be backed by one).
-- Per the Phase 4 existing-operations audit's own recommendation, this
-- EXTENDS `hs_equipment_inspections` in place — a generic "thorough
-- examination" framework, LOLER first — rather than a new table.
--
-- `hs_equipment.loler_applicable` (144) gates it, the same guard shape
-- Group 5 (PUWER) just established for `puwer_applicable`.
--
-- IMMEDIATE DANGER (LOLER reg 8: a defect involving an existing or
-- imminent risk of serious injury) is the one thing this migration
-- treats with real weight:
--   * it quarantines the asset UNCONDITIONALLY, regardless of what the
--     `outcome` column says (the examiner should always record a fail
--     alongside it, but the database does not trust that to have
--     happened correctly — same defence-in-depth reasoning
--     hs_submit_inspection/hs_quarantine_asset (146) already applies);
--   * it is FLAGGED, never DECIDED — this file follows the exact
--     "RIDDOR is decision support, never auto-decide, never submit to
--     the HSE" posture Phase 2 already established for a different
--     regulator: nothing here reports anything to the HSE or asserts a
--     legal conclusion. It raises an urgent internal action and an
--     urgent notification; a person reads it and acts.
--
-- Idempotent. Safe to re-run.

ALTER TABLE public.hs_equipment_inspections
  ADD COLUMN IF NOT EXISTS examination_type text
    CHECK (examination_type IS NULL OR examination_type IN ('loler_thorough_examination')),
  ADD COLUMN IF NOT EXISTS immediate_danger boolean NOT NULL DEFAULT false;

-- Only a LOLER-applicable asset may record a LOLER thorough examination
-- against it. A plain routine inspection (examination_type NULL) is
-- unaffected — this column is entirely additive.
CREATE OR REPLACE FUNCTION public.hs_equipment_inspection_examination_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE eq record;
BEGIN
  IF NEW.examination_type = 'loler_thorough_examination' THEN
    SELECT loler_applicable INTO eq FROM public.hs_equipment WHERE id = NEW.equipment_id;
    IF NOT FOUND OR NOT eq.loler_applicable THEN
      RAISE EXCEPTION 'This asset is not flagged as LOLER-applicable' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.hs_equipment_inspection_examination_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS hs_equipment_inspection_examination_guard ON public.hs_equipment_inspections;
CREATE TRIGGER hs_equipment_inspection_examination_guard BEFORE INSERT ON public.hs_equipment_inspections
  FOR EACH ROW EXECUTE FUNCTION public.hs_equipment_inspection_examination_guard();

-- hs_equipment_inspection_roll() (114) re-emitted: unchanged pass/fail
-- roll-forward logic, plus an unconditional quarantine on
-- immediate_danger — checked BEFORE the pass/fail branch so it applies
-- however `outcome` was recorded. Reuses hs_quarantine_asset() (146)
-- rather than a second quarantine path: same SECURITY DEFINER reasoning
-- (a client recording their own examiner's result has no UPDATE policy
-- on hs_equipment either).
CREATE OR REPLACE FUNCTION public.hs_equipment_inspection_roll()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.immediate_danger THEN
    PERFORM public.hs_quarantine_asset(NEW.equipment_id);
  END IF;
  IF NEW.outcome = 'fail' THEN RETURN NULL; END IF;
  UPDATE public.hs_equipment eq
     SET last_inspected_on   = NEW.inspected_on,
         next_inspection_due = coalesce(NEW.next_due_on, eq.next_inspection_due),
         updated_at          = now()
   WHERE eq.id = NEW.equipment_id
     AND (eq.last_inspected_on IS NULL OR eq.last_inspected_on <= NEW.inspected_on);
  RETURN NULL;
END $$;

-- ── outbox: hs_equipment_inspections joins TRIGGERED_ENTITIES (it never
--    did before — nothing needed reacting to a routine inspection
--    result until immediate danger needed one). Whitelist carries only
--    classifying columns, never notes.

DROP TRIGGER IF EXISTS hs_equipment_inspections_platform_event ON public.hs_equipment_inspections;
CREATE TRIGGER hs_equipment_inspections_platform_event AFTER INSERT ON public.hs_equipment_inspections
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('equipment_id', 'outcome', 'next_due_on', 'examination_type', 'immediate_danger');

-- A LOLER finding is an actions row too — 'equipment_inspection' is
-- already an allowed actions.source_type value (119/125), so no CHECK
-- change is needed.
