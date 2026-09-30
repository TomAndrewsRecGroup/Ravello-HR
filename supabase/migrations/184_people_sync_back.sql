-- ═══════════════════════════════════════════════════════════════════
-- 184: people synced back from source rows (Core-OS 360 Completion
-- Programme, Phase 21, closing C1.10)
-- ═══════════════════════════════════════════════════════════════════
--
-- Phase 1's own handover (§H, "Technical debt (explicit)") recorded
-- this plainly: "people is fed one way. Changes to a source row's name
-- or email are not synced back to the person." person_link_row() (118)
-- is BEFORE INSERT ONLY on candidates/athletes/employee_records — it
-- links or creates the people row once, at creation, and never runs
-- again. The one existing follow-up, person_employee_status() (also
-- 118), only reacts to employee_records.status changing (a leaver),
-- never to a name, email, phone, job title, department or site edit.
-- The Safe-to-Deploy engine, the person profile page, and every export
-- that reads `people` have therefore been reading a snapshot from
-- whenever the source row was first created, silently drifting further
-- out of step with every edit made afterward.
--
-- WHY this is a NEW trigger, never a rewrite of person_link_row(): that
-- function is BEFORE INSERT and returns NEW to let the row through
-- (possibly unlinked, on any error — it never raises). A sync needs
-- AFTER UPDATE instead: it changes a DIFFERENT row (people), not the
-- one being written, so BEFORE/RETURN NEW has no part to play here;
-- AFTER UPDATE returning NULL (the same shape person_employee_status()
-- already uses) is correct and simpler.
--
-- WHY full_name/email always overwrite but job_title/employee_number/
-- department_id/site_id/phone only fill a gap (COALESCE with the
-- existing people value): this mirrors person_link_row()'s own INSERT-
-- time behaviour exactly (`job_title = COALESCE(NEW.job_title,
-- job_title)`) — a field that can genuinely go blank on the source row
-- (an employee's job title left empty during an edit, a phone number
-- removed) should not silently blank out a people row that may still
-- be the more complete record another source table also feeds. Name
-- and email are different: both are NOT NULL on every source table
-- (never blanked to nothing), and a corrected typo needs to always
-- win — that is the exact failure this migration exists to fix.
--
-- WHY athletes has no phone sync: the athletes table itself has never
-- had a phone column (041) — there is nothing to read.
--
-- WHY this never raises (the same discipline person_link_row() and
-- person_employee_status() already use): editing a candidate, athlete
-- or employee record must never fail because of a problem updating the
-- linked people row (a rare race, a since-deleted people row). A
-- WARNING is logged; the edit to the source row itself always succeeds.

CREATE OR REPLACE FUNCTION public.person_sync_from_source()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.person_id IS NULL THEN RETURN NULL; END IF;
  BEGIN
    IF TG_TABLE_NAME = 'candidates' THEN
      UPDATE people SET
        full_name = NEW.full_name,
        email     = COALESCE(NEW.email, email),
        phone     = COALESCE(NEW.phone, phone)
      WHERE id = NEW.person_id;
    ELSIF TG_TABLE_NAME = 'athletes' THEN
      UPDATE people SET
        full_name = NEW.full_name,
        email     = COALESCE(NEW.email, email)
      WHERE id = NEW.person_id;
    ELSIF TG_TABLE_NAME = 'employee_records' THEN
      UPDATE people SET
        full_name       = NEW.full_name,
        email           = COALESCE(NEW.email, email),
        phone           = COALESCE(NEW.phone, phone),
        job_title       = COALESCE(NEW.job_title, job_title),
        employee_number = COALESCE(NEW.employee_number, employee_number),
        department_id   = COALESCE(NEW.department_id, department_id),
        site_id         = COALESCE(NEW.site_id, site_id)
      WHERE id = NEW.person_id;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'person_sync_from_source(%): %', TG_TABLE_NAME, SQLERRM;
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.person_sync_from_source() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS candidates_person_sync ON public.candidates;
CREATE TRIGGER candidates_person_sync
  AFTER UPDATE OF full_name, email, phone ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.person_sync_from_source();

DROP TRIGGER IF EXISTS athletes_person_sync ON public.athletes;
CREATE TRIGGER athletes_person_sync
  AFTER UPDATE OF full_name, email ON public.athletes
  FOR EACH ROW EXECUTE FUNCTION public.person_sync_from_source();

DROP TRIGGER IF EXISTS employee_records_person_sync ON public.employee_records;
CREATE TRIGGER employee_records_person_sync
  AFTER UPDATE OF full_name, email, phone, job_title, employee_number, department_id, site_id ON public.employee_records
  FOR EACH ROW EXECUTE FUNCTION public.person_sync_from_source();
