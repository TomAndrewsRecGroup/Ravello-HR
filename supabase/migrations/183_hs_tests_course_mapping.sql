-- ═══════════════════════════════════════════════════════════════════
-- 183: hs_tests -> training-requirement mapping via an explicit
-- course_id (Core-OS 360 Completion Programme, Phase 21)
-- ═══════════════════════════════════════════════════════════════════
--
-- Phase 20's completion matrix (C3.9) and the Master Spec's own "Known
-- repository evidence" both record the same gap: a passed hs_tests
-- submission already writes a training_records row
-- (hs_test_submission_after(), 116) — but that row has never carried a
-- course_id, so it is structurally invisible to the Safe-to-Deploy
-- engine's 'training' branch (_wf_judge, 142), which matches strictly
-- on `t.course_id = p_ref`. Closing a role's training requirement with
-- an hs_test result has only ever been possible by manual database
-- intervention.
--
-- WHY course_id is added to hs_tests, not just to the submission insert:
-- the mapping is a property of the TEST itself ("this fire-warden quiz
-- certifies the Fire Warden Refresher course"), decided once by staff
-- when building the test, not re-chosen every time someone submits it.
--
-- WHY it must be a GLOBAL course (training_courses.company_id IS NULL)
-- and this is enforced by a trigger, not just picker-list discipline:
-- hs_tests has no company_id column at all -- it is staff's own,
-- cross-client test bank (same posture as hs_audit_templates/
-- hs_sector_packs), assigned to employees at MANY different client
-- companies. training_courses.company_id being non-null means "only
-- this one organisation's own course" -- assert_catalogue() (134),
-- which workforce_evidence_guard() already runs on every
-- training_records write, would then refuse the auto-logged row for
-- every OTHER company the same test is ever assigned to. A UI that
-- only lists global courses stops a staff member typing the wrong ID
-- by hand; the trigger is what stops it landing in the database at all
-- regardless of how the write happened.
--
-- WHY the mapping is optional (nullable): most tests still have no
-- course to certify against (certifies_training itself is already
-- optional, and plenty of tests -- a toolbox-talk comprehension check,
-- a one-off knowledge quiz -- were never meant to satisfy a formal
-- training requirement). Existing tests and existing training_records
-- rows are completely unaffected; only a NEWLY submitted, PASSED
-- result of a test that HAS course_id set going forward gets a
-- requirement-visible row.

ALTER TABLE public.hs_tests
  ADD COLUMN IF NOT EXISTS course_id uuid REFERENCES public.training_courses(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.hs_tests_course_guard()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE org uuid; found boolean;
BEGIN
  IF NEW.course_id IS NOT NULL THEN
    SELECT true, company_id INTO found, org FROM public.training_courses WHERE id = NEW.course_id;
    IF NOT COALESCE(found, false) THEN
      RAISE EXCEPTION 'Unknown training course' USING ERRCODE = '23503';
    END IF;
    IF org IS NOT NULL THEN
      RAISE EXCEPTION 'hs_tests.course_id must reference a standard (global) course -- an hs_test is assigned across many client companies, and a company-specific course would be refused as unavailable to every other company the moment a passed result tried to log it'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.hs_tests_course_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS hs_tests_course_guard ON public.hs_tests;
CREATE TRIGGER hs_tests_course_guard
  BEFORE INSERT OR UPDATE OF course_id ON public.hs_tests
  FOR EACH ROW EXECUTE FUNCTION public.hs_tests_course_guard();

-- hs_test_submission_after(), redefined: carries course_id onto the
-- training_records insert, and stamps source = 'hs_test' (a value the
-- table's own CHECK -- training_records_source_check, 134 -- has
-- allowed since it was written, never previously set by this trigger).
-- Everything else is 116's own body, untouched: still only fires on a
-- PASS of a certifies_training test, still leaves verification_status
-- at its default 'unverified' -- an hs_test result, self-submitted or
-- staff-logged, is still exactly the kind of evidence rule 143 ("a
-- mandatory item always needs verified evidence") exists to catch; nothing
-- here auto-verifies it.
CREATE OR REPLACE FUNCTION public.hs_test_submission_after()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE t record;
BEGIN
  UPDATE public.hs_test_assignments SET status = 'completed' WHERE id = NEW.assignment_id;
  IF NEW.passed THEN
    SELECT title, certifies_training, recert_months, course_id INTO t FROM public.hs_tests WHERE id = NEW.test_id;
    IF t.certifies_training THEN
      INSERT INTO public.training_records (company_id, employee_id, course_id, course_name, completed_on, expires_on, source, notes)
      VALUES (
        NEW.company_id, NEW.employee_id, t.course_id, t.title, NEW.submitted_at::date,
        CASE WHEN t.recert_months IS NOT NULL
          THEN (NEW.submitted_at::date + (t.recert_months || ' months')::interval)::date
          ELSE NULL END,
        'hs_test',
        'Logged automatically from a passed test.'
      );
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.hs_test_submission_after() FROM PUBLIC, anon, authenticated;
