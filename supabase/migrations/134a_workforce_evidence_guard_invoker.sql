-- ═══════════════════════════════════════════════════════════════════
-- 134a: workforce_evidence_guard runs as the CALLER (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- Found by probe 134 on its first run. 134 declared the guard SECURITY
-- DEFINER, and inside a DEFINER function current_user is the OWNER, so
-- `current_user IN ('authenticated','anon')` was always false and every
-- session-only rule was skipped: an employee's self-submitted
-- certificate was stored as `verified`, and a recorder could mark their
-- own entry verified. No live rows were affected (the tables were empty
-- and no deployed code writes them).
--
-- This is the rule 088 already states: a trigger that keys on
-- current_user must be SECURITY INVOKER. The lookups that need to see
-- past the caller's RLS move into small DEFINER helpers that return one
-- value each.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.workforce_person_company(p_person uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT company_id FROM people WHERE id = p_person
$$;
CREATE OR REPLACE FUNCTION public.workforce_employee_person(p_employee uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT person_id FROM employee_records WHERE id = p_employee
$$;
CREATE OR REPLACE FUNCTION public.workforce_course_title(p_course uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT title FROM training_courses WHERE id = p_course
$$;
CREATE OR REPLACE FUNCTION public.workforce_row_company(p_table text, p_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE org uuid;
BEGIN
  IF p_table NOT IN ('person_authorisations','learning_paths') THEN
    RAISE EXCEPTION 'Unsupported table' USING ERRCODE = '22023';
  END IF;
  EXECUTE format('SELECT company_id FROM public.%I WHERE id = $1', p_table) INTO org USING p_id;
  RETURN org;
END $$;
REVOKE ALL ON FUNCTION public.workforce_person_company(uuid), public.workforce_employee_person(uuid),
  public.workforce_course_title(uuid), public.workforce_row_company(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workforce_person_company(uuid), public.workforce_employee_person(uuid),
  public.workforce_course_title(uuid), public.workforce_row_company(text, uuid) TO authenticated, service_role;

-- The guard now runs as the caller, so the caller must be able to run the
-- two assertion helpers it calls. They only ever raise on a cross-
-- organisation link; they return nothing.
GRANT EXECUTE ON FUNCTION public.assert_same_org(uuid, text, uuid), public.assert_catalogue(uuid, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.workforce_evidence_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
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
    org := public.workforce_person_company((nj ->> 'person_id')::uuid);
    IF org IS NULL THEN RAISE EXCEPTION 'Unknown person' USING ERRCODE = '23503'; END IF;
    NEW.company_id := org;
  END IF;

  CASE TG_TABLE_NAME
    WHEN 'training_records' THEN
      PERFORM public.assert_catalogue(NEW.company_id, 'training_courses', NEW.course_id);
      IF NEW.employee_id IS NOT NULL THEN PERFORM public.assert_same_org(NEW.company_id, 'employee_records', NEW.employee_id); END IF;
      IF NEW.person_id IS NULL AND NEW.employee_id IS NOT NULL THEN
        NEW.person_id := public.workforce_employee_person(NEW.employee_id);
      END IF;
      IF NEW.course_id IS NOT NULL AND NULLIF(btrim(NEW.course_name), '') IS NULL THEN
        NEW.course_name := public.workforce_course_title(NEW.course_id);
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
      NEW.company_id := public.workforce_row_company('person_authorisations', NEW.authorisation_id);
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
      NEW.company_id := public.workforce_row_company('learning_paths', NEW.path_id);
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
REVOKE ALL ON FUNCTION public.workforce_evidence_guard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.workforce_evidence_guard() TO authenticated;
