-- ═══════════════════════════════════════════════════════════════════
-- 116: H&S Tests — the consultancy's own assessments (2026-09-26)
-- ═══════════════════════════════════════════════════════════════════
--
-- Operator: staff need to test employees across many clients on the
-- same day (fire warden refreshers, manual handling, toolbox-talk
-- comprehension checks…), delivered either as a real quiz the platform
-- hosts and marks itself, or as an external link / Microsoft Form the
-- employee completes elsewhere, or entirely in person with no digital
-- form at all. Every route ends the same way: one submission row filed
-- under the right employee, visible to their employer in the portal.
--
-- WHY the marking split is what it is (Tom's decision, 2026-09-25):
-- neither Microsoft Forms nor most external quiz tools expose individual
-- response data through an API this platform could poll — building
-- "auto-fetch the result" for those would be building against an
-- integration that mostly doesn't exist. So only 'built_in' tests
-- (questions this table stores and the app itself marks) score
-- themselves the instant someone submits; 'link'/'ms_forms'/'manual'
-- assignments still get a first-class record, but their score/pass is
-- entered by whoever administered the test, once the result is known.
--
-- WHY every assignment still gets ONE token link regardless of source:
-- one consistent delivery experience (an email, a link) rather than
-- three different processes depending on which vendor a test happens
-- to come from. What that link SHOWS differs by source (a quiz to
-- answer vs. "open your test here, your result will be logged for
-- you"), but the employee never needs to know which kind it is.
--
-- WHY no platform_events outbox entry: unlike the H&S register, a test
-- submission has exactly two controlled entry points this codebase
-- itself owns end to end (the public token route, and the admin
-- "log a result" route), both already holding a service-role or
-- staff-session client when the write happens. Routing that through an
-- async outbox + a five-minute-later consumer would only delay the
-- notification for no benefit — both routes call notify() directly,
-- synchronously, the same way lib/bd/score.ts and lib/lead/weeklyPeople.ts
-- already do outside the event-rule system.
--
-- WHY no hs_events Safety Timeline entry: tests are a training/HR
-- assessment record, not a Health & Safety register item — the same
-- category training_records (111) already sits in, and that table has
-- no Timeline entry either. A passed, certifying test writes into
-- training_records directly (see hs_test_submission_after below), so
-- it surfaces wherever training currency is already checked, rather
-- than inventing a second place to look.

CREATE TABLE IF NOT EXISTS public.hs_tests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title              text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  description        text CHECK (length(description) <= 4000),
  category           text CHECK (length(category) <= 100),
  source_type        text NOT NULL CHECK (source_type IN ('built_in', 'link', 'ms_forms', 'manual')),
  external_url       text CHECK (length(external_url) <= 2000),
  pass_mark          integer CHECK (pass_mark BETWEEN 0 AND 100),
  questions          jsonb,
  certifies_training boolean NOT NULL DEFAULT false,
  recert_months      integer CHECK (recert_months IS NULL OR recert_months BETWEEN 1 AND 120),
  active             boolean NOT NULL DEFAULT true,
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.hs_test_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id       uuid NOT NULL REFERENCES public.hs_tests(id) ON DELETE CASCADE,
  title         text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  scheduled_on  date,
  notes         text CHECK (length(notes) <= 2000),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hs_test_sessions_test_idx ON public.hs_test_sessions (test_id);

-- One row per invited person. session_id is nullable so a single
-- one-off assignment (no cohort) needs no session at all.
CREATE TABLE IF NOT EXISTS public.hs_test_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid REFERENCES public.hs_test_sessions(id) ON DELETE SET NULL,
  test_id      uuid NOT NULL REFERENCES public.hs_tests(id) ON DELETE CASCADE,
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id  uuid NOT NULL REFERENCES public.employee_records(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hs_test_assignments_company_idx  ON public.hs_test_assignments (company_id);
CREATE INDEX IF NOT EXISTS hs_test_assignments_employee_idx ON public.hs_test_assignments (employee_id);
CREATE INDEX IF NOT EXISTS hs_test_assignments_session_idx  ON public.hs_test_assignments (session_id);

-- Insert-only — a correction is a new assignment + new submission, the
-- same "a correction is a new row" discipline the register uses. ONE
-- submission per assignment: a genuine retake is a fresh assignment,
-- never a second row against the same one.
CREATE TABLE IF NOT EXISTS public.hs_test_submissions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id    uuid NOT NULL UNIQUE REFERENCES public.hs_test_assignments(id) ON DELETE CASCADE,
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id      uuid NOT NULL REFERENCES public.employee_records(id) ON DELETE CASCADE,
  test_id          uuid NOT NULL REFERENCES public.hs_tests(id) ON DELETE CASCADE,
  source           text NOT NULL CHECK (source IN ('built_in', 'link', 'ms_forms', 'manual')),
  score            integer CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  passed           boolean NOT NULL,
  answers          jsonb,
  notes            text CHECK (length(notes) <= 2000),
  recorded_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_by_kind text NOT NULL CHECK (recorded_by_kind IN ('employee', 'staff')),
  submitted_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hs_test_submissions_company_idx  ON public.hs_test_submissions (company_id);
CREATE INDEX IF NOT EXISTS hs_test_submissions_employee_idx ON public.hs_test_submissions (employee_id, submitted_at DESC);

-- Same shape as policy_ack_tokens (103): SHA-256 only, RLS on, NO
-- policies at all — the public token route always uses the service
-- role, so nothing needs a client-facing grant on this table.
CREATE TABLE IF NOT EXISTS public.hs_test_tokens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash     text NOT NULL UNIQUE,
  assignment_id  uuid NOT NULL REFERENCES public.hs_test_assignments(id) ON DELETE CASCADE,
  expires_at     timestamptz NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS hs_test_tokens_assignment_idx ON public.hs_test_tokens (assignment_id);

-- ── fill: company/employee/test/source/recorded_by_kind come from the
-- database, never the caller. `passed` for a built_in test is ALSO
-- recomputed here from score+pass_mark regardless of what was sent —
-- belt and braces against a marking bug in the application layer
-- producing a score/passed pair that disagree. recorded_by_kind is
-- derived from the TEST's source, not from auth.uid()/current_user:
-- both the public token route (self-submission) and the admin
-- "log a result" route insert via a route this codebase controls, some
-- under the service role — hs_actor_kind() cannot tell those apart, but
-- source can: only a built_in test is ever self-submitted.
CREATE OR REPLACE FUNCTION public.hs_test_submission_fill()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE a record; t record;
BEGIN
  SELECT company_id, employee_id, test_id INTO a
    FROM public.hs_test_assignments WHERE id = NEW.assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Test assignment not found' USING ERRCODE = '23503';
  END IF;
  SELECT source_type, pass_mark INTO t FROM public.hs_tests WHERE id = a.test_id;
  NEW.company_id       := a.company_id;
  NEW.employee_id      := a.employee_id;
  NEW.test_id          := a.test_id;
  NEW.source           := t.source_type;
  NEW.recorded_by      := auth.uid();
  NEW.recorded_by_kind := CASE WHEN t.source_type = 'built_in' THEN 'employee' ELSE 'staff' END;
  IF t.source_type = 'built_in' THEN
    NEW.passed := (t.pass_mark IS NOT NULL AND NEW.score IS NOT NULL AND NEW.score >= t.pass_mark);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.hs_test_submission_fill() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS hs_test_submission_fill ON public.hs_test_submissions;
CREATE TRIGGER hs_test_submission_fill
  BEFORE INSERT ON public.hs_test_submissions
  FOR EACH ROW EXECUTE FUNCTION public.hs_test_submission_fill();

-- ── after: mark the assignment completed, and — only on a PASS of a
-- test flagged as certifying — write the same training_records table
-- the LEAD Training Records page/matrix/expiry reminders already read,
-- rather than inventing a second "is this person's training current"
-- source. recert_months absent means no expiry, same as a hand-entered
-- training_records row with a blank expiry.
CREATE OR REPLACE FUNCTION public.hs_test_submission_after()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE t record;
BEGIN
  UPDATE public.hs_test_assignments SET status = 'completed' WHERE id = NEW.assignment_id;
  IF NEW.passed THEN
    SELECT title, certifies_training, recert_months INTO t FROM public.hs_tests WHERE id = NEW.test_id;
    IF t.certifies_training THEN
      INSERT INTO public.training_records (company_id, employee_id, course_name, completed_on, expires_on, notes)
      VALUES (
        NEW.company_id, NEW.employee_id, t.title, NEW.submitted_at::date,
        CASE WHEN t.recert_months IS NOT NULL
          THEN (NEW.submitted_at::date + (t.recert_months || ' months')::interval)::date
          ELSE NULL END,
        'Logged automatically from a passed test.'
      );
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.hs_test_submission_after() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS hs_test_submission_after ON public.hs_test_submissions;
CREATE TRIGGER hs_test_submission_after
  AFTER INSERT ON public.hs_test_submissions
  FOR EACH ROW EXECUTE FUNCTION public.hs_test_submission_after();

REVOKE UPDATE, DELETE, TRUNCATE ON public.hs_test_submissions FROM PUBLIC, anon, authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────
-- Tests and sessions are staff's own drafting/scheduling tools, same
-- posture as audit templates and sector packs: never client-visible on
-- their own. Assignments and submissions ARE client-visible, read-only
-- (nothing here is self-certified) — a client sees who was tested and
-- the result, never the question bank.

ALTER TABLE public.hs_tests             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hs_test_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hs_test_assignments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hs_test_submissions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hs_test_tokens       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hs_tests_staff_all ON public.hs_tests;
CREATE POLICY hs_tests_staff_all ON public.hs_tests FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

DROP POLICY IF EXISTS hs_test_sessions_staff_all ON public.hs_test_sessions;
CREATE POLICY hs_test_sessions_staff_all ON public.hs_test_sessions FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

DROP POLICY IF EXISTS hs_test_assignments_staff_all ON public.hs_test_assignments;
CREATE POLICY hs_test_assignments_staff_all ON public.hs_test_assignments FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS hs_test_assignments_client_read ON public.hs_test_assignments;
CREATE POLICY hs_test_assignments_client_read ON public.hs_test_assignments FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));

DROP POLICY IF EXISTS hs_test_submissions_staff_all ON public.hs_test_submissions;
CREATE POLICY hs_test_submissions_staff_all ON public.hs_test_submissions FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS hs_test_submissions_client_read ON public.hs_test_submissions;
CREATE POLICY hs_test_submissions_client_read ON public.hs_test_submissions FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));

-- hs_test_tokens: deliberately no policies at all.
