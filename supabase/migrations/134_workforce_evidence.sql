-- ═══════════════════════════════════════════════════════════════════
-- 134: Core-OS 360 Phase 3 — evidence (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- Plan §4. What satisfies a requirement, with its history kept.
--
--   training_records (111, EXTENDED)   person_id, course_id, result,
--                                       verification, source; employee_id
--                                       now optional (contractors)
--   training_sessions / _attendance     scheduling; a pass creates a record
--   person_competencies                 INSERT-ONLY assessment history
--   competency_suspensions              suspension / reinstatement rows
--   person_credentials                  qualifications, certificates,
--                                       licences, cards, permits
--   induction_assignments / _completions
--   person_authorisations (+ _suspensions)
--   ppe_issues · pre_employment_checks
--   requirement_exceptions              time-limited, approved, audited
--   development_items · learning_paths (+ steps)
--   onboarding gates                    template task gate + gate_days
--   employee_documents.person_id
--
-- VERIFICATION is never a column a session writes. The guard triggers
-- key on current_user (as 088 does): through PostgREST it is
-- `authenticated`; inside a SECURITY DEFINER function it is the owner.
-- So verification, suspension, exceptions and waivers happen only in
-- the RPCs at the end of this file, which check the capability, refuse
-- self-verification of safety-critical evidence, and use conditional
-- counted updates so two verifiers cannot both win.
--
-- Nothing here READS evidence for a decision; that is 136.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 0. Shared helpers ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_session_role()
RETURNS boolean LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT current_user IN ('authenticated', 'anon')
$$;

-- The caller may manage workforce evidence for this person: org-level
-- capability in the organisation they act in, or staff.
CREATE OR REPLACE FUNCTION public.workforce_can(p_org uuid, p_cap text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.is_tps_staff() OR (p_org = public.my_company_id() AND public.has_capability(p_org, p_cap))
$$;
REVOKE ALL ON FUNCTION public.workforce_can(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workforce_can(uuid, text) TO authenticated, service_role;

-- Is this person the caller?
CREATE OR REPLACE FUNCTION public.is_me(p_person uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM people WHERE id = p_person AND user_id = auth.uid())
$$;
REVOKE ALL ON FUNCTION public.is_me(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_me(uuid) TO authenticated, service_role;

-- ─── 1. training_records, extended ──────────────────────────────────

ALTER TABLE public.training_records
  ADD COLUMN IF NOT EXISTS person_id           uuid REFERENCES public.people(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS course_id           uuid REFERENCES public.training_courses(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS result              text NOT NULL DEFAULT 'pass',
  ADD COLUMN IF NOT EXISTS certificate_number  text CHECK (length(certificate_number) <= 120),
  ADD COLUMN IF NOT EXISTS evidence_path       text CHECK (length(evidence_path) <= 500),
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verified_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verified_at         timestamptz,
  ADD COLUMN IF NOT EXISTS rejection_reason    text CHECK (length(rejection_reason) <= 500),
  ADD COLUMN IF NOT EXISTS source              text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS submitted_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS expiry_override_reason text CHECK (length(expiry_override_reason) <= 500);
ALTER TABLE public.training_records ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE public.training_records DROP CONSTRAINT IF EXISTS training_records_result_check;
ALTER TABLE public.training_records ADD CONSTRAINT training_records_result_check CHECK (result IN ('pass','fail','attended'));
ALTER TABLE public.training_records DROP CONSTRAINT IF EXISTS training_records_verification_check;
ALTER TABLE public.training_records ADD CONSTRAINT training_records_verification_check
  CHECK (verification_status IN ('unverified','verified','rejected'));
ALTER TABLE public.training_records DROP CONSTRAINT IF EXISTS training_records_source_check;
ALTER TABLE public.training_records ADD CONSTRAINT training_records_source_check
  CHECK (source IN ('manual','self','import','hs_test','elearning','session','consultant'));
ALTER TABLE public.training_records DROP CONSTRAINT IF EXISTS training_records_subject_check;
ALTER TABLE public.training_records ADD CONSTRAINT training_records_subject_check
  CHECK (person_id IS NOT NULL OR employee_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS training_records_person_idx ON public.training_records (person_id, course_id, completed_on DESC);
CREATE INDEX IF NOT EXISTS training_records_expiry_idx ON public.training_records (company_id, expires_on) WHERE expires_on IS NOT NULL;

UPDATE public.training_records t SET person_id = e.person_id
  FROM public.employee_records e WHERE e.id = t.employee_id AND t.person_id IS NULL AND e.person_id IS NOT NULL;

-- ─── 2. The evidence tables ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.training_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  course_id   uuid NOT NULL REFERENCES public.training_courses(id) ON DELETE RESTRICT,
  provider    text CHECK (length(provider) <= 200),
  starts_at   timestamptz NOT NULL,
  ends_at     timestamptz,
  location    text CHECK (length(location) <= 300),
  capacity    integer CHECK (capacity BETWEEN 1 AND 1000),
  status      text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','confirmed','completed','cancelled')),
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at IS NULL OR ends_at >= starts_at)
);
CREATE TABLE IF NOT EXISTS public.training_attendance (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  session_id         uuid NOT NULL REFERENCES public.training_sessions(id) ON DELETE CASCADE,
  person_id          uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  status             text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','attended','no_show','passed','failed','reschedule_required')),
  training_record_id uuid REFERENCES public.training_records(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, person_id)
);

CREATE TABLE IF NOT EXISTS public.person_competencies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id           uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  competency_id       uuid NOT NULL REFERENCES public.competencies(id) ON DELETE RESTRICT,
  level_id            uuid NOT NULL REFERENCES public.competency_levels(id) ON DELETE RESTRICT,
  assessed_on         date NOT NULL DEFAULT current_date,
  expires_on          date,
  assessment_method   text NOT NULL CHECK (assessment_method IN
                        ('practical_observation','external_certificate','assessment','supervisor_signoff',
                         'qualification','logged_experience','competency_test')),
  assessor_name       text CHECK (length(assessor_name) <= 200),
  assessed_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  evidence_path       text CHECK (length(evidence_path) <= 500),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','verified','rejected')),
  verified_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at         timestamptz,
  rejection_reason    text CHECK (length(rejection_reason) <= 500),
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_on IS NULL OR expires_on >= assessed_on)
);
CREATE TABLE IF NOT EXISTS public.competency_suspensions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id     uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  competency_id uuid NOT NULL REFERENCES public.competencies(id) ON DELETE RESTRICT,
  suspended_at  timestamptz NOT NULL DEFAULT now(),
  reason        text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  suspended_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_type   text CHECK (source_type IN ('manual','incident','audit','investigation')),
  source_id     uuid,
  lifted_at     timestamptz,
  lifted_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lift_reason   text CHECK (length(lift_reason) <= 1000),
  CHECK (lifted_at IS NULL OR lifted_at >= suspended_at)
);

CREATE TABLE IF NOT EXISTS public.person_credentials (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id           uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  credential_type_id  uuid NOT NULL REFERENCES public.credential_types(id) ON DELETE RESTRICT,
  credential_number   text CHECK (length(credential_number) <= 120),
  awarding_body       text CHECK (length(awarding_body) <= 200),
  issued_on           date,
  expires_on          date,
  evidence_path       text CHECK (length(evidence_path) <= 500),
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','verified','rejected')),
  verified_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at         timestamptz,
  rejection_reason    text CHECK (length(rejection_reason) <= 500),
  source              text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','self','import','consultant')),
  submitted_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_on IS NULL OR issued_on IS NULL OR expires_on >= issued_on)
);

CREATE TABLE IF NOT EXISTS public.induction_assignments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id             uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  induction_template_id uuid NOT NULL REFERENCES public.induction_templates(id) ON DELETE RESTRICT,
  assigned_on           date NOT NULL DEFAULT current_date,
  required_before       date,
  status                text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','completed','cancelled')),
  created_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.induction_completions (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id             uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  induction_template_id uuid NOT NULL REFERENCES public.induction_templates(id) ON DELETE RESTRICT,
  completed_on          date NOT NULL DEFAULT current_date,
  completed_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  delivered_by_name     text CHECK (length(delivered_by_name) <= 200),
  reinduction_due       date,
  evidence_path         text CHECK (length(evidence_path) <= 500),
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.person_authorisations (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id             uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  authorisation_type_id uuid NOT NULL REFERENCES public.authorisation_types(id) ON DELETE RESTRICT,
  scope_site_id         uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  scope_detail          text CHECK (length(scope_detail) <= 300),
  issuing_authority     text CHECK (length(issuing_authority) <= 200),
  issued_on             date NOT NULL DEFAULT current_date,
  expires_on            date,
  authorised_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  evidence_path         text CHECK (length(evidence_path) <= 500),
  status                text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  revoked_at            timestamptz,
  revoked_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoke_reason         text CHECK (length(revoke_reason) <= 500),
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_on IS NULL OR expires_on >= issued_on)
);
CREATE TABLE IF NOT EXISTS public.authorisation_suspensions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  authorisation_id uuid NOT NULL REFERENCES public.person_authorisations(id) ON DELETE CASCADE,
  suspended_at     timestamptz NOT NULL DEFAULT now(),
  reason           text NOT NULL CHECK (length(btrim(reason)) BETWEEN 3 AND 1000),
  suspended_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source_type      text CHECK (source_type IN ('manual','incident','audit','investigation')),
  source_id        uuid,
  lifted_at        timestamptz,
  lifted_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  lift_reason      text CHECK (length(lift_reason) <= 1000),
  CHECK (lifted_at IS NULL OR lifted_at >= suspended_at)
);

CREATE TABLE IF NOT EXISTS public.ppe_issues (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id       uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  ppe_type_id     uuid NOT NULL REFERENCES public.ppe_types(id) ON DELETE RESTRICT,
  issued_on       date NOT NULL DEFAULT current_date,
  replacement_due date,
  serial_number   text CHECK (length(serial_number) <= 120),
  size            text CHECK (length(size) <= 40),
  issued_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  returned_on     date,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CHECK (replacement_due IS NULL OR replacement_due >= issued_on)
);

CREATE TABLE IF NOT EXISTS public.pre_employment_checks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id     uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  check_type_id uuid NOT NULL REFERENCES public.pre_employment_check_types(id) ON DELETE RESTRICT,
  status        text NOT NULL DEFAULT 'required' CHECK (status IN ('required','requested','received','verified','failed','waived')),
  requested_on  date,
  received_on   date,
  evidence_path text CHECK (length(evidence_path) <= 500),
  verified_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at   timestamptz,
  decision_reason text CHECK (length(decision_reason) <= 1000),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, check_type_id)
);

-- Never permanent (spec 34): every exception, waiver and not-applicable
-- has an approver, a reason and an end date no more than 90 days out.
CREATE TABLE IF NOT EXISTS public.requirement_exceptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id        uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  requirement_type text NOT NULL CHECK (requirement_type = ANY (public.workforce_requirement_types())),
  reference_id     uuid,
  reference_key    text CHECK (length(reference_key) <= 100),
  kind             text NOT NULL CHECK (kind IN ('temporary_exception','waiver','not_applicable')),
  reason           text NOT NULL CHECK (length(btrim(reason)) BETWEEN 10 AND 1000),
  approved_by      uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at      timestamptz NOT NULL DEFAULT now(),
  valid_from       date NOT NULL DEFAULT current_date,
  valid_until      date NOT NULL,
  revoked_at       timestamptz,
  revoked_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoke_reason    text CHECK (length(revoke_reason) <= 500),
  CHECK (valid_until >= valid_from AND valid_until <= valid_from + 90),
  CHECK (reference_id IS NOT NULL OR reference_key IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS public.development_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id            uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  title                text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 300),
  source_type          text NOT NULL DEFAULT 'manual' CHECK (source_type IN
                         ('manual','performance_review','competency_gap','career','return_to_work','onboarding','succession','incident')),
  source_id            uuid,
  linked_course_id     uuid REFERENCES public.training_courses(id) ON DELETE SET NULL,
  linked_competency_id uuid REFERENCES public.competencies(id) ON DELETE SET NULL,
  status               text NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','cancelled')),
  due_date             date,
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.learning_paths (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title         text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  role_id       uuid REFERENCES public.job_roles(id) ON DELETE SET NULL,
  active_status text NOT NULL DEFAULT 'active' CHECK (active_status IN ('active','inactive')),
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.learning_path_steps (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  path_id       uuid NOT NULL REFERENCES public.learning_paths(id) ON DELETE CASCADE,
  position      integer NOT NULL CHECK (position BETWEEN 1 AND 200),
  course_id     uuid REFERENCES public.training_courses(id) ON DELETE RESTRICT,
  competency_id uuid REFERENCES public.competencies(id) ON DELETE RESTRICT,
  title         text CHECK (length(title) <= 200),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (path_id, position),
  CHECK (num_nonnulls(course_id, competency_id) = 1)
);

-- Onboarding gates (spec 58-59).
ALTER TABLE public.onboarding_template_tasks
  ADD COLUMN IF NOT EXISTS gate      text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS gate_days integer CHECK (gate_days BETWEEN 0 AND 365);
ALTER TABLE public.onboarding_template_tasks DROP CONSTRAINT IF EXISTS onboarding_template_tasks_gate_check;
ALTER TABLE public.onboarding_template_tasks ADD CONSTRAINT onboarding_template_tasks_gate_check
  CHECK (gate IN ('none','before_start','before_unsupervised','within_days') AND ((gate = 'within_days') = (gate_days IS NOT NULL)));
ALTER TABLE public.onboarding_task_progress
  ADD COLUMN IF NOT EXISTS gate      text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS gate_days integer CHECK (gate_days BETWEEN 0 AND 365);
ALTER TABLE public.onboarding_task_progress DROP CONSTRAINT IF EXISTS onboarding_task_progress_gate_check;
ALTER TABLE public.onboarding_task_progress ADD CONSTRAINT onboarding_task_progress_gate_check
  CHECK (gate IN ('none','before_start','before_unsupervised','within_days') AND ((gate = 'within_days') = (gate_days IS NOT NULL)));

-- Employee documents join the person (document requirements, spec 27).
ALTER TABLE public.employee_documents ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS employee_documents_person_idx ON public.employee_documents (person_id, doc_type) WHERE person_id IS NOT NULL;
UPDATE public.employee_documents d SET person_id = e.person_id
  FROM public.employee_records e WHERE e.id = d.employee_id AND d.person_id IS NULL AND e.person_id IS NOT NULL;

-- ─── 3. Indexes ─────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS training_sessions_company_idx ON public.training_sessions (company_id, starts_at);
CREATE INDEX IF NOT EXISTS training_attendance_person_idx ON public.training_attendance (person_id);
CREATE INDEX IF NOT EXISTS person_competencies_person_idx ON public.person_competencies (person_id, competency_id, assessed_on DESC);
CREATE INDEX IF NOT EXISTS person_competencies_company_idx ON public.person_competencies (company_id, expires_on);
CREATE INDEX IF NOT EXISTS competency_suspensions_person_idx ON public.competency_suspensions (person_id, competency_id);
CREATE INDEX IF NOT EXISTS person_credentials_person_idx ON public.person_credentials (person_id, credential_type_id);
CREATE INDEX IF NOT EXISTS person_credentials_company_idx ON public.person_credentials (company_id, expires_on);
CREATE INDEX IF NOT EXISTS induction_assignments_person_idx ON public.induction_assignments (person_id, status);
CREATE INDEX IF NOT EXISTS induction_completions_person_idx ON public.induction_completions (person_id, induction_template_id, completed_on DESC);
CREATE INDEX IF NOT EXISTS person_authorisations_person_idx ON public.person_authorisations (person_id, authorisation_type_id);
CREATE INDEX IF NOT EXISTS authorisation_suspensions_auth_idx ON public.authorisation_suspensions (authorisation_id);
CREATE INDEX IF NOT EXISTS ppe_issues_person_idx ON public.ppe_issues (person_id, ppe_type_id);
CREATE INDEX IF NOT EXISTS pre_employment_checks_company_idx ON public.pre_employment_checks (company_id, status);
CREATE INDEX IF NOT EXISTS requirement_exceptions_person_idx ON public.requirement_exceptions (person_id, requirement_type, reference_id);
CREATE INDEX IF NOT EXISTS development_items_person_idx ON public.development_items (person_id, status);
CREATE INDEX IF NOT EXISTS learning_paths_company_idx ON public.learning_paths (company_id);

-- ─── 4. Integrity: organisation, catalogue scope, immutability ──────

-- Catalogue row must be this organisation's or global.
CREATE OR REPLACE FUNCTION public.assert_catalogue(p_company uuid, p_table text, p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE found boolean; org uuid;
BEGIN
  IF p_id IS NULL THEN RETURN; END IF;
  EXECUTE format('SELECT true, company_id FROM public.%I WHERE id = $1', p_table) INTO found, org USING p_id;
  IF NOT COALESCE(found, false) OR (org IS NOT NULL AND org <> p_company) THEN
    RAISE EXCEPTION '% % is not available to this organisation', p_table, p_id USING ERRCODE = '23503';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_catalogue(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- One guard for every evidence table: fill company_id from the person
-- (never trusted from the caller), keep links inside the organisation,
-- and refuse any session write to the fields only the RPCs may set.
CREATE OR REPLACE FUNCTION public.workforce_evidence_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE org uuid; sess boolean := current_user IN ('authenticated', 'anon');
        nj jsonb; oj jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF sess AND TG_TABLE_NAME IN ('person_competencies','competency_suspensions','authorisation_suspensions',
                                  'induction_completions','requirement_exceptions') THEN
      RAISE EXCEPTION '% is history and is never deleted', TG_TABLE_NAME USING ERRCODE = '42501';
    END IF;
    IF sess AND TG_TABLE_NAME IN ('training_records','person_credentials') THEN
      IF to_jsonb(OLD) ->> 'verification_status' = 'verified' THEN
        RAISE EXCEPTION 'Verified evidence is never deleted' USING ERRCODE = '42501';
      END IF;
      -- Deleting unverified evidence stays what it was before 134: the
      -- organisation's admin (or staff), not everyone who may record it.
      IF NOT (public.is_tps_staff() OR public.is_company_super_user()) THEN
        RAISE EXCEPTION 'Only an administrator deletes evidence' USING ERRCODE = '42501';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  nj := to_jsonb(NEW);
  -- The organisation always comes from the person (or the session / path).
  -- (Fields are read through jsonb here: one trigger serves tables with
  -- different columns, and a plpgsql expression naming NEW.person_id
  -- fails on a table that has no such column.)
  IF (nj ->> 'person_id') IS NOT NULL THEN
    SELECT company_id INTO org FROM people WHERE id = (nj ->> 'person_id')::uuid;
    IF org IS NULL THEN RAISE EXCEPTION 'Unknown person' USING ERRCODE = '23503'; END IF;
    NEW.company_id := org;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'training_records' THEN
      PERFORM public.assert_catalogue(NEW.company_id, 'training_courses', NEW.course_id);
      IF NEW.employee_id IS NOT NULL THEN PERFORM public.assert_same_org(NEW.company_id, 'employee_records', NEW.employee_id); END IF;
      IF NEW.person_id IS NULL AND NEW.employee_id IS NOT NULL THEN
        NEW.person_id := (SELECT person_id FROM employee_records WHERE id = NEW.employee_id);
      END IF;
      IF NEW.course_id IS NOT NULL AND NULLIF(btrim(NEW.course_name), '') IS NULL THEN
        NEW.course_name := (SELECT title FROM training_courses WHERE id = NEW.course_id);
      END IF;
    WHEN 'training_sessions' THEN
      PERFORM public.assert_catalogue(NEW.company_id, 'training_courses', NEW.course_id);
    WHEN 'training_attendance' THEN
      PERFORM public.assert_same_org(NEW.company_id, 'training_sessions', NEW.session_id);
    WHEN 'person_competencies' THEN
      PERFORM public.assert_catalogue(NEW.company_id, 'competencies', NEW.competency_id);
      PERFORM public.assert_catalogue(NEW.company_id, 'competency_levels', NEW.level_id);
    WHEN 'competency_suspensions' THEN
      PERFORM public.assert_catalogue(NEW.company_id, 'competencies', NEW.competency_id);
    WHEN 'person_credentials' THEN
      PERFORM public.assert_catalogue(NEW.company_id, 'credential_types', NEW.credential_type_id);
    WHEN 'induction_assignments', 'induction_completions' THEN
      PERFORM public.assert_catalogue(NEW.company_id, 'induction_templates', NEW.induction_template_id);
    WHEN 'person_authorisations' THEN
      PERFORM public.assert_catalogue(NEW.company_id, 'authorisation_types', NEW.authorisation_type_id);
      PERFORM public.assert_same_org(NEW.company_id, 'hs_sites', NEW.scope_site_id);
    WHEN 'authorisation_suspensions' THEN
      NEW.company_id := (SELECT company_id FROM person_authorisations WHERE id = NEW.authorisation_id);
    WHEN 'ppe_issues' THEN
      PERFORM public.assert_catalogue(NEW.company_id, 'ppe_types', NEW.ppe_type_id);
    WHEN 'pre_employment_checks' THEN
      PERFORM public.assert_catalogue(NEW.company_id, 'pre_employment_check_types', NEW.check_type_id);
    WHEN 'development_items' THEN
      PERFORM public.assert_catalogue(NEW.company_id, 'training_courses', NEW.linked_course_id);
      PERFORM public.assert_catalogue(NEW.company_id, 'competencies', NEW.linked_competency_id);
    WHEN 'learning_paths' THEN
      PERFORM public.assert_same_org(NEW.company_id, 'job_roles', NEW.role_id);
    WHEN 'learning_path_steps' THEN
      NEW.company_id := (SELECT company_id FROM learning_paths WHERE id = NEW.path_id);
      PERFORM public.assert_catalogue(NEW.company_id, 'training_courses', NEW.course_id);
      PERFORM public.assert_catalogue(NEW.company_id, 'competencies', NEW.competency_id);
    ELSE NULL;
  END CASE;

  IF NOT sess THEN RETURN NEW; END IF;

  -- ── Session writes only from here. ──
  IF TG_TABLE_NAME IN ('competency_suspensions','authorisation_suspensions','requirement_exceptions') THEN
    RAISE EXCEPTION 'Use the % functions', TG_TABLE_NAME USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME IN ('training_records','person_credentials','person_competencies') THEN
    IF TG_OP = 'INSERT' THEN
      -- New evidence always starts unverified; a verifier is never self-appointed.
      NEW.verification_status := 'unverified';
      NEW.verified_by := NULL; NEW.verified_at := NULL; NEW.rejection_reason := NULL;
      IF TG_TABLE_NAME <> 'person_competencies' THEN NEW.submitted_by := auth.uid(); END IF;
      IF TG_TABLE_NAME = 'person_competencies' THEN
        NEW.assessed_by := auth.uid();
        IF public.is_me(NEW.person_id) THEN
          RAISE EXCEPTION 'Nobody assesses their own competence' USING ERRCODE = '42501';
        END IF;
      END IF;
    ELSE
      IF TG_TABLE_NAME = 'person_competencies' THEN
        RAISE EXCEPTION 'An assessment is never edited; record a new one' USING ERRCODE = '42501';
      END IF;
      oj := to_jsonb(OLD);
      IF OLD.verification_status <> 'unverified' THEN
        RAISE EXCEPTION 'Verified or rejected evidence is never edited; record a new one' USING ERRCODE = '42501';
      END IF;
      IF (nj -> 'verification_status', nj -> 'verified_by', nj -> 'verified_at', nj -> 'rejection_reason', nj -> 'submitted_by')
         IS DISTINCT FROM (oj -> 'verification_status', oj -> 'verified_by', oj -> 'verified_at', oj -> 'rejection_reason', oj -> 'submitted_by') THEN
        RAISE EXCEPTION 'Verification is recorded through the verify functions' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'induction_completions' AND TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'A completion is never edited; record a new one' USING ERRCODE = '42501';
  END IF;
  IF TG_TABLE_NAME = 'induction_completions' AND TG_OP = 'INSERT' THEN
    NEW.completed_by := auth.uid();
  END IF;

  IF TG_TABLE_NAME = 'person_authorisations' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.authorised_by := auth.uid(); NEW.status := 'active';
      NEW.revoked_at := NULL; NEW.revoked_by := NULL; NEW.revoke_reason := NULL;
      IF public.is_me(NEW.person_id) THEN
        RAISE EXCEPTION 'Nobody authorises themselves' USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'An authorisation is never edited; revoke or suspend it and issue a new one' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'pre_employment_checks' THEN
    IF NEW.status IN ('verified','failed','waived') AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status) THEN
      RAISE EXCEPTION 'Use pre_employment_check_decide() to verify, fail or waive a check' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.status IN ('verified','failed','waived') THEN
      RAISE EXCEPTION 'A decided check is never edited' USING ERRCODE = '42501';
    END IF;
    IF (to_jsonb(NEW) -> 'verified_by') IS DISTINCT FROM (CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) -> 'verified_by' ELSE 'null'::jsonb END) THEN
      RAISE EXCEPTION 'Use pre_employment_check_decide()' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF TG_TABLE_NAME = 'training_attendance' THEN
    IF (nj -> 'training_record_id') IS DISTINCT FROM
       (CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) -> 'training_record_id' ELSE 'null'::jsonb END) THEN
      RAISE EXCEPTION 'Use training_session_record_outcomes() to create records from attendance' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.workforce_evidence_guard() FROM PUBLIC, anon, authenticated;

-- ─── 5. RLS, guard, audit, updated_at on every evidence table ───────
--
-- READ: person_visible(person) — org-wide workforce.read, the person's
--       manager or site/department manager, the person, staff.
-- WRITE (by table):
--   training_records, person_credentials, induction_completions,
--   development_items (self may read)                    training.manage
--   training_records, person_credentials: the person may SUBMIT their own
--   (source 'self'; unverified by the guard)
--   person_competencies                                   competency.assess
--   person_authorisations, ppe_issues, induction_assignments,
--   pre_employment_checks                                 workforce.manage
--   training_sessions/attendance, learning_paths/steps    training.manage

DO $$
DECLARE
  t text; write_cap text; self_submit boolean; has_person boolean; audit_cols text;
BEGIN
  FOR t, write_cap, self_submit, audit_cols IN VALUES
    ('training_records',         'training.manage',   true,  '''person_id'', ''course_id'', ''completed_on'', ''expires_on'', ''result'', ''verification_status'', ''source'''),
    ('training_sessions',        'training.manage',   false, '''course_id'', ''starts_at'', ''status'''),
    ('training_attendance',      'training.manage',   false, '''session_id'', ''person_id'', ''status'''),
    ('person_competencies',      'competency.assess', false, '''person_id'', ''competency_id'', ''level_id'', ''assessed_on'', ''expires_on'', ''verification_status'''),
    ('competency_suspensions',   'competency.verify', false, '''person_id'', ''competency_id'', ''suspended_at'', ''lifted_at'', ''source_type'', ''source_id'''),
    ('person_credentials',       'training.manage',   true,  '''person_id'', ''credential_type_id'', ''issued_on'', ''expires_on'', ''verification_status'', ''source'''),
    ('induction_assignments',    'workforce.manage',  false, '''person_id'', ''induction_template_id'', ''required_before'', ''status'''),
    ('induction_completions',    'training.manage',   false, '''person_id'', ''induction_template_id'', ''completed_on'', ''reinduction_due'''),
    ('person_authorisations',    'workforce.manage',  false, '''person_id'', ''authorisation_type_id'', ''scope_site_id'', ''issued_on'', ''expires_on'', ''status'''),
    ('authorisation_suspensions','competency.verify', false, '''authorisation_id'', ''suspended_at'', ''lifted_at'', ''source_type'', ''source_id'''),
    ('ppe_issues',               'workforce.manage',  false, '''person_id'', ''ppe_type_id'', ''issued_on'', ''replacement_due'', ''returned_on'''),
    ('pre_employment_checks',    'workforce.manage',  false, '''person_id'', ''check_type_id'', ''status'''),
    ('requirement_exceptions',   'deployment.exception.approve', false, '''person_id'', ''requirement_type'', ''reference_id'', ''reference_key'', ''kind'', ''valid_from'', ''valid_until'', ''revoked_at'''),
    ('development_items',        'training.manage',   false, '''person_id'', ''title'', ''source_type'', ''status'', ''due_date'''),
    ('learning_paths',           'training.manage',   false, '''title'', ''role_id'', ''active_status'''),
    ('learning_path_steps',      'training.manage',   false, '''path_id'', ''position'', ''course_id'', ''competency_id''')
  LOOP
    has_person := EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'person_id');
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    -- Drop every existing policy on the table (111's broad company-wide
    -- training_records policies included) and replace them.
    PERFORM 1;
    EXECUTE (SELECT COALESCE(string_agg(format('DROP POLICY IF EXISTS %I ON public.%I;', policyname, t), ' '), 'SELECT 1')
               FROM pg_policies WHERE schemaname = 'public' AND tablename = t);
    EXECUTE format('CREATE POLICY %1$s_staff_all ON public.%1$I FOR ALL TO authenticated USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()))', t);
    IF t = 'authorisation_suspensions' THEN
      EXECUTE 'CREATE POLICY authorisation_suspensions_read ON public.authorisation_suspensions FOR SELECT TO authenticated
               USING (EXISTS (SELECT 1 FROM public.person_authorisations a WHERE a.id = authorisation_id AND public.person_visible(a.person_id)))';
    ELSIF has_person THEN
      EXECUTE format('CREATE POLICY %1$s_read ON public.%1$I FOR SELECT TO authenticated USING (public.person_visible(person_id))', t);
    ELSE
      EXECUTE format('CREATE POLICY %1$s_read ON public.%1$I FOR SELECT TO authenticated USING (company_id = (SELECT public.my_company_id()))', t);
    END IF;
    EXECUTE format('CREATE POLICY %1$s_manage ON public.%1$I FOR ALL TO authenticated USING (public.workforce_can(company_id, %2$L)) WITH CHECK (public.workforce_can(company_id, %2$L))', t, write_cap);
    IF self_submit THEN
      EXECUTE format('CREATE POLICY %1$s_self_submit ON public.%1$I FOR INSERT TO authenticated WITH CHECK (source = ''self'' AND public.is_me(person_id))', t);
      EXECUTE format('CREATE POLICY %1$s_self_edit ON public.%1$I FOR UPDATE TO authenticated USING (source = ''self'' AND verification_status = ''unverified'' AND public.is_me(person_id)) WITH CHECK (source = ''self'' AND public.is_me(person_id))', t);
    END IF;
    PERFORM public.apply_write_guard(format('public.%I', t)::regclass);
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_evidence_guard ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.workforce_evidence_guard()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_audit ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_audit AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.audit_row(%2$L, ''company_id'', %3$s)',
                   t, CASE t WHEN 'training_records' THEN 'training'
                             WHEN 'person_competencies' THEN 'competency'
                             WHEN 'person_credentials' THEN 'qualification'
                             WHEN 'induction_completions' THEN 'induction'
                             WHEN 'person_authorisations' THEN 'authorisation'
                             WHEN 'requirement_exceptions' THEN 'requirement_exception'
                             ELSE regexp_replace(t, 's$', '') END, audit_cols);
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'updated_at') THEN
      EXECUTE format('DROP TRIGGER IF EXISTS %1$s_updated_at ON public.%1$I', t);
      EXECUTE format('CREATE TRIGGER %1$s_updated_at BEFORE UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at()', t);
    END IF;
  END LOOP;
END $$;

-- History tables: no session UPDATE or DELETE at all (the guard also
-- refuses; this makes it structural).
REVOKE UPDATE, DELETE, TRUNCATE ON public.person_competencies, public.competency_suspensions,
  public.authorisation_suspensions, public.induction_completions, public.requirement_exceptions FROM anon, authenticated;
REVOKE INSERT ON public.competency_suspensions, public.authorisation_suspensions, public.requirement_exceptions FROM anon, authenticated;

-- ─── 6. The only ways to verify, suspend, except and waive ──────────

-- Does this person carry a live safety-critical requirement for this item?
CREATE OR REPLACE FUNCTION public.workforce_item_safety_critical(p_person uuid, p_type text, p_ref uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM role_assignments a JOIN role_requirements r ON r.role_id = a.role_id
     WHERE a.person_id = p_person AND a.assignment_status = 'active'
       AND r.requirement_type = p_type AND r.reference_id = p_ref AND r.safety_critical
       AND r.effective_from IS NOT NULL AND r.effective_from <= current_date
       AND (r.effective_until IS NULL OR r.effective_until >= current_date)
    UNION ALL
    SELECT 1 FROM role_assignments a JOIN site_requirements r ON r.site_id = a.site_id
     WHERE a.person_id = p_person AND a.assignment_status = 'active'
       AND r.requirement_type = p_type AND r.reference_id = p_ref AND r.safety_critical
       AND r.effective_from IS NOT NULL AND r.effective_from <= current_date
       AND (r.effective_until IS NULL OR r.effective_until >= current_date)
    UNION ALL
    SELECT 1 FROM person_requirements r
     WHERE r.person_id = p_person AND r.requirement_type = p_type AND r.reference_id = p_ref AND r.safety_critical
       AND r.effective_from IS NOT NULL AND r.effective_from <= current_date
       AND (r.effective_until IS NULL OR r.effective_until >= current_date))
  OR (p_type = 'training'   AND EXISTS (SELECT 1 FROM training_courses WHERE id = p_ref AND safety_critical))
  OR (p_type = 'competency' AND EXISTS (SELECT 1 FROM competencies WHERE id = p_ref AND safety_critical))
$$;
REVOKE ALL ON FUNCTION public.workforce_item_safety_critical(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

-- Verify or reject one piece of evidence. p_kind: training | credential | competency.
CREATE OR REPLACE FUNCTION public.workforce_verify(p_kind text, p_id uuid, p_verdict text, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  tbl text; cap text; org uuid; person uuid; submitter uuid; ref uuid; ref_type text; sc boolean; n int;
BEGIN
  IF p_verdict NOT IN ('verified','rejected') THEN RAISE EXCEPTION 'Verdict is verified or rejected' USING ERRCODE = '22023'; END IF;
  IF p_verdict = 'rejected' AND length(btrim(COALESCE(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Say why the evidence is rejected' USING ERRCODE = '22023';
  END IF;
  CASE p_kind
    WHEN 'training' THEN
      tbl := 'training_records'; cap := 'training.verify'; ref_type := 'training';
      SELECT company_id, person_id, submitted_by, course_id INTO org, person, submitter, ref FROM training_records WHERE id = p_id;
    WHEN 'credential' THEN
      tbl := 'person_credentials'; cap := 'training.verify';
      SELECT c.company_id, c.person_id, c.submitted_by, c.credential_type_id, t.kind
        INTO org, person, submitter, ref, ref_type
        FROM person_credentials c JOIN credential_types t ON t.id = c.credential_type_id WHERE c.id = p_id;
    WHEN 'competency' THEN
      tbl := 'person_competencies'; cap := 'competency.verify'; ref_type := 'competency';
      SELECT company_id, person_id, assessed_by, competency_id INTO org, person, submitter, ref FROM person_competencies WHERE id = p_id;
    ELSE RAISE EXCEPTION 'Unknown evidence kind' USING ERRCODE = '22023';
  END CASE;
  IF org IS NULL THEN RAISE EXCEPTION 'Evidence not found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.session_can_write() OR NOT public.workforce_can(org, cap) THEN
    RAISE EXCEPTION 'You cannot verify this evidence' USING ERRCODE = '42501';
  END IF;
  IF public.is_me(person) THEN
    RAISE EXCEPTION 'Nobody verifies their own evidence' USING ERRCODE = '42501';
  END IF;
  sc := public.workforce_item_safety_critical(person, ref_type, ref);
  IF sc AND p_verdict = 'verified' THEN
    IF NOT public.workforce_can(org, 'workforce.verify_safety_critical') THEN
      RAISE EXCEPTION 'Safety-critical evidence needs a designated verifier' USING ERRCODE = '42501';
    END IF;
    IF submitter = auth.uid() AND NOT public.is_tps_staff() THEN
      RAISE EXCEPTION 'Safety-critical evidence is verified by someone other than who recorded it' USING ERRCODE = '42501';
    END IF;
  END IF;
  EXECUTE format('UPDATE public.%I SET verification_status = $2, verified_by = auth.uid(), verified_at = now(),
                    rejection_reason = CASE WHEN $2 = ''rejected'' THEN btrim($3) END
                  WHERE id = $1 AND verification_status = ''unverified''', tbl)
    USING p_id, p_verdict, p_reason;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'This evidence has already been decided' USING ERRCODE = '40001'; END IF;
END $$;

-- Suspend / reinstate a competency or an authorisation. Immediate effect
-- on Safe to Deploy (136 reads the suspension rows). Never automatic:
-- only a person holding competency.verify calls these (spec 84-85).
CREATE OR REPLACE FUNCTION public.competency_suspend(p_person uuid, p_competency uuid, p_reason text,
                                                    p_source_type text DEFAULT 'manual', p_source_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE org uuid; new_id uuid;
BEGIN
  SELECT company_id INTO org FROM people WHERE id = p_person;
  IF org IS NULL OR NOT public.session_can_write() OR NOT public.workforce_can(org, 'competency.verify') THEN
    RAISE EXCEPTION 'You cannot suspend competence here' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM competency_suspensions WHERE person_id = p_person AND competency_id = p_competency AND lifted_at IS NULL) THEN
    RAISE EXCEPTION 'Already suspended' USING ERRCODE = '23505';
  END IF;
  INSERT INTO competency_suspensions (company_id, person_id, competency_id, reason, suspended_by, source_type, source_id)
    VALUES (org, p_person, p_competency, btrim(p_reason), auth.uid(), p_source_type, p_source_id) RETURNING id INTO new_id;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.competency_reinstate(p_suspension uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE org uuid; n int;
BEGIN
  SELECT company_id INTO org FROM competency_suspensions WHERE id = p_suspension;
  IF org IS NULL OR NOT public.session_can_write() OR NOT public.workforce_can(org, 'competency.verify') THEN
    RAISE EXCEPTION 'You cannot reinstate competence here' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'Say why' USING ERRCODE = '22023'; END IF;
  UPDATE competency_suspensions SET lifted_at = now(), lifted_by = auth.uid(), lift_reason = btrim(p_reason)
   WHERE id = p_suspension AND lifted_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Not suspended' USING ERRCODE = '40001'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.authorisation_suspend(p_authorisation uuid, p_reason text,
                                                       p_source_type text DEFAULT 'manual', p_source_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE org uuid; new_id uuid;
BEGIN
  SELECT company_id INTO org FROM person_authorisations WHERE id = p_authorisation AND status = 'active';
  IF org IS NULL OR NOT public.session_can_write() OR NOT public.workforce_can(org, 'competency.verify') THEN
    RAISE EXCEPTION 'You cannot suspend this authorisation' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM authorisation_suspensions WHERE authorisation_id = p_authorisation AND lifted_at IS NULL) THEN
    RAISE EXCEPTION 'Already suspended' USING ERRCODE = '23505';
  END IF;
  INSERT INTO authorisation_suspensions (company_id, authorisation_id, reason, suspended_by, source_type, source_id)
    VALUES (org, p_authorisation, btrim(p_reason), auth.uid(), p_source_type, p_source_id) RETURNING id INTO new_id;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.authorisation_reinstate(p_suspension uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE org uuid; n int;
BEGIN
  SELECT company_id INTO org FROM authorisation_suspensions WHERE id = p_suspension;
  IF org IS NULL OR NOT public.session_can_write() OR NOT public.workforce_can(org, 'competency.verify') THEN
    RAISE EXCEPTION 'You cannot reinstate this authorisation' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'Say why' USING ERRCODE = '22023'; END IF;
  UPDATE authorisation_suspensions SET lifted_at = now(), lifted_by = auth.uid(), lift_reason = btrim(p_reason)
   WHERE id = p_suspension AND lifted_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Not suspended' USING ERRCODE = '40001'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.authorisation_revoke(p_authorisation uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE org uuid; n int;
BEGIN
  SELECT company_id INTO org FROM person_authorisations WHERE id = p_authorisation;
  IF org IS NULL OR NOT public.session_can_write() OR NOT public.workforce_can(org, 'workforce.manage') THEN
    RAISE EXCEPTION 'You cannot revoke this authorisation' USING ERRCODE = '42501';
  END IF;
  IF length(btrim(COALESCE(p_reason, ''))) < 3 THEN RAISE EXCEPTION 'Say why' USING ERRCODE = '22023'; END IF;
  UPDATE person_authorisations SET status = 'revoked', revoked_at = now(), revoked_by = auth.uid(), revoke_reason = btrim(p_reason)
   WHERE id = p_authorisation AND status = 'active';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Already revoked' USING ERRCODE = '40001'; END IF;
END $$;

-- Exceptions, waivers and not-applicable: approved, reasoned, bounded.
CREATE OR REPLACE FUNCTION public.requirement_exception_grant(
  p_person uuid, p_type text, p_reference_id uuid, p_reference_key text, p_kind text, p_reason text,
  p_valid_until date, p_valid_from date DEFAULT current_date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE org uuid; new_id uuid;
BEGIN
  SELECT company_id INTO org FROM people WHERE id = p_person;
  IF org IS NULL OR NOT public.session_can_write() OR NOT public.workforce_can(org, 'deployment.exception.approve') THEN
    RAISE EXCEPTION 'You cannot approve exceptions here' USING ERRCODE = '42501';
  END IF;
  IF public.is_me(p_person) THEN
    RAISE EXCEPTION 'Nobody approves an exception for themselves' USING ERRCODE = '42501';
  END IF;
  IF p_valid_from < current_date THEN RAISE EXCEPTION 'An exception cannot start in the past' USING ERRCODE = '22023'; END IF;
  INSERT INTO requirement_exceptions (company_id, person_id, requirement_type, reference_id, reference_key, kind,
                                      reason, approved_by, valid_from, valid_until)
    VALUES (org, p_person, p_type, p_reference_id, p_reference_key, p_kind, btrim(p_reason), auth.uid(),
            p_valid_from, p_valid_until) RETURNING id INTO new_id;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION public.requirement_exception_revoke(p_id uuid, p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE org uuid; n int;
BEGIN
  SELECT company_id INTO org FROM requirement_exceptions WHERE id = p_id;
  IF org IS NULL OR NOT public.session_can_write() OR NOT public.workforce_can(org, 'deployment.exception.approve') THEN
    RAISE EXCEPTION 'You cannot revoke this exception' USING ERRCODE = '42501';
  END IF;
  UPDATE requirement_exceptions SET revoked_at = now(), revoked_by = auth.uid(), revoke_reason = btrim(p_reason)
   WHERE id = p_id AND revoked_at IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'Already revoked' USING ERRCODE = '40001'; END IF;
END $$;

-- Pre-employment checks: verify / fail (workforce.manage) or waive
-- (deployment.exception.approve), with a reason for fail and waive.
CREATE OR REPLACE FUNCTION public.pre_employment_check_decide(p_id uuid, p_decision text, p_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE org uuid; person uuid; n int;
BEGIN
  IF p_decision NOT IN ('verified','failed','waived') THEN RAISE EXCEPTION 'Unknown decision' USING ERRCODE = '22023'; END IF;
  SELECT company_id, person_id INTO org, person FROM pre_employment_checks WHERE id = p_id;
  IF org IS NULL OR NOT public.session_can_write()
     OR NOT public.workforce_can(org, CASE WHEN p_decision = 'waived' THEN 'deployment.exception.approve' ELSE 'workforce.manage' END) THEN
    RAISE EXCEPTION 'You cannot decide this check' USING ERRCODE = '42501';
  END IF;
  IF public.is_me(person) THEN RAISE EXCEPTION 'Nobody decides their own check' USING ERRCODE = '42501'; END IF;
  IF p_decision IN ('failed','waived') AND length(btrim(COALESCE(p_reason, ''))) < 10 THEN
    RAISE EXCEPTION 'A failed or waived check needs a reason' USING ERRCODE = '22023';
  END IF;
  UPDATE pre_employment_checks SET status = p_decision, verified_by = auth.uid(), verified_at = now(),
         decision_reason = NULLIF(btrim(COALESCE(p_reason, '')), '')
   WHERE id = p_id AND status NOT IN ('verified','failed','waived');
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN RAISE EXCEPTION 'This check has already been decided' USING ERRCODE = '40001'; END IF;
END $$;

-- Attendance → training records. Only a PASS creates a record (spec 53):
-- attendance alone is not completion. Records start unverified.
CREATE OR REPLACE FUNCTION public.training_session_record_outcomes(p_session uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE s training_sessions%ROWTYPE; a record; rec_id uuid; n int := 0; months int;
BEGIN
  SELECT * INTO s FROM training_sessions WHERE id = p_session;
  IF s.id IS NULL OR NOT public.session_can_write() OR NOT public.workforce_can(s.company_id, 'training.manage') THEN
    RAISE EXCEPTION 'You cannot record outcomes for this session' USING ERRCODE = '42501';
  END IF;
  SELECT validity_months INTO months FROM training_courses WHERE id = s.course_id;
  FOR a IN SELECT * FROM training_attendance WHERE session_id = p_session AND status = 'passed' AND training_record_id IS NULL
           FOR UPDATE LOOP
    INSERT INTO training_records (company_id, person_id, course_id, course_name, provider, completed_on, expires_on,
                                  result, source, submitted_by)
      SELECT s.company_id, a.person_id, s.course_id, c.title, COALESCE(s.provider, c.provider), (s.starts_at AT TIME ZONE 'Europe/London')::date,
             CASE WHEN months IS NOT NULL THEN ((s.starts_at AT TIME ZONE 'Europe/London')::date + make_interval(months => months))::date END,
             'pass', 'session', auth.uid()
        FROM training_courses c WHERE c.id = s.course_id
      RETURNING id INTO rec_id;
    UPDATE training_attendance SET training_record_id = rec_id WHERE id = a.id;
    n := n + 1;
  END LOOP;
  UPDATE training_sessions SET status = 'completed' WHERE id = p_session AND status <> 'cancelled';
  RETURN n;
END $$;

REVOKE ALL ON FUNCTION public.workforce_verify(text, uuid, text, text), public.competency_suspend(uuid, uuid, text, text, uuid),
  public.competency_reinstate(uuid, text), public.authorisation_suspend(uuid, text, text, uuid),
  public.authorisation_reinstate(uuid, text), public.authorisation_revoke(uuid, text),
  public.requirement_exception_grant(uuid, text, uuid, text, text, text, date, date),
  public.requirement_exception_revoke(uuid, text), public.pre_employment_check_decide(uuid, text, text),
  public.training_session_record_outcomes(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workforce_verify(text, uuid, text, text), public.competency_suspend(uuid, uuid, text, text, uuid),
  public.competency_reinstate(uuid, text), public.authorisation_suspend(uuid, text, text, uuid),
  public.authorisation_reinstate(uuid, text), public.authorisation_revoke(uuid, text),
  public.requirement_exception_grant(uuid, text, uuid, text, text, text, date, date),
  public.requirement_exception_revoke(uuid, text), public.pre_employment_check_decide(uuid, text, text),
  public.training_session_record_outcomes(uuid) TO authenticated;

-- ─── 7. Evidence files ──────────────────────────────────────────────
-- Private bucket. Keys: <org>/<kind>/<person>/<uuid>-<name>. A file is
-- readable exactly when an evidence row the caller can see points at it
-- (the row's RLS is inherited). Upload: into your organisation's folder
-- with a workforce capability, or into your own person folder.

INSERT INTO storage.buckets (id, name, public) VALUES ('workforce-evidence', 'workforce-evidence', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS workforce_evidence_staff_all ON storage.objects;
CREATE POLICY workforce_evidence_staff_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'workforce-evidence' AND (SELECT public.is_tps_staff()))
  WITH CHECK (bucket_id = 'workforce-evidence' AND (SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS workforce_evidence_read ON storage.objects;
CREATE POLICY workforce_evidence_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'workforce-evidence' AND (
       EXISTS (SELECT 1 FROM public.training_records r WHERE r.evidence_path = objects.name)
    OR EXISTS (SELECT 1 FROM public.person_credentials r WHERE r.evidence_path = objects.name)
    OR EXISTS (SELECT 1 FROM public.person_competencies r WHERE r.evidence_path = objects.name)
    OR EXISTS (SELECT 1 FROM public.induction_completions r WHERE r.evidence_path = objects.name)
    OR EXISTS (SELECT 1 FROM public.person_authorisations r WHERE r.evidence_path = objects.name)
    OR EXISTS (SELECT 1 FROM public.pre_employment_checks r WHERE r.evidence_path = objects.name)));
DROP POLICY IF EXISTS workforce_evidence_insert ON storage.objects;
CREATE POLICY workforce_evidence_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'workforce-evidence'
    AND (storage.foldername(name))[1] = (SELECT public.my_company_id())::text
    AND ((storage.foldername(name))[2] IN ('training','credential','competency','induction','authorisation','pre_employment'))
    AND (   public.has_capability((SELECT public.my_company_id()), 'training.manage')
         OR public.has_capability((SELECT public.my_company_id()), 'workforce.manage')
         OR public.has_capability((SELECT public.my_company_id()), 'competency.assess')
         OR (storage.foldername(name))[3] = (SELECT public.my_person_id(public.my_company_id()))::text));
