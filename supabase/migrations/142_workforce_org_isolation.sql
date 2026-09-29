-- ═══════════════════════════════════════════════════════════════════
-- 142: workforce evidence stays inside its own organisation (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- Found by the Phase 3 adversarial security review (QA 42). Three
-- CRITICAL cross-client defects, each proven live in a rolled-back probe:
--
--   C1  A plain user in client A inserted an employee_documents row with
--       company A and person = client B's worker; B's worker went
--       NOT_READY → READY. Nothing tied employee_documents.person_id to
--       the row's organisation, and _wf_judge read documents by person
--       with no organisation filter. Documents also skipped verification
--       even for a safety-critical requirement.
--   C2  An employee in A self-submitted training evidence whose
--       evidence_path was one of B's files, and could then read it: the
--       workforce-evidence read policy trusts ANY visible row naming the
--       object.
--   C3  The same for oh-clinical: an advisor granted on A read one of B's
--       clinical documents.
--
-- And one HIGH (not proven end to end, closed anyway): sessions may write
-- employee_records.person_id (and candidates/athletes) with no same-
-- organisation check, which also feeds people visibility (118), the
-- onboarding gates (136) and the training guard's employee_id route.
--
-- Two MEDIUMs fixed here: a safety-critical item past its expiry counted
-- as met during grace_days; ppe_types / pre_employment_check_types never
-- marked cached statuses stale.
--
-- Live before applying: 0 rows mismatched on any of these links, 0
-- evidence paths, 0 clinical rows. Nothing to repair.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. A person link never crosses an organisation ──────────────────
-- SECURITY INVOKER (keys on nothing but the row); the lookup is 134a's
-- DEFINER helper. Applies to every writer: no legitimate path links a
-- row to another organisation's person.
CREATE OR REPLACE FUNCTION public.person_same_org_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.person_id IS NOT NULL
     AND public.workforce_person_company(NEW.person_id) IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'The person belongs to another organisation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.person_same_org_guard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_same_org_guard() TO authenticated;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['employee_records','candidates','athletes'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_person_same_org ON public.%1$I', t);
    -- Named to sort AFTER %s_person_link, so a person the link trigger
    -- just found is checked too (it always finds one in the same org).
    EXECUTE format('CREATE TRIGGER %1$s_person_same_org BEFORE INSERT OR UPDATE OF person_id, company_id ON public.%1$I
                    FOR EACH ROW EXECUTE FUNCTION public.person_same_org_guard()', t);
  END LOOP;
END $$;

-- ─── 2. employee_documents: person from the employee, and who filed it ─
-- filed_by_authorised records, at write time, whether the writer held
-- workforce authority in the organisation and was not the worker. The
-- engine runs without a session and cannot ask this later. A safety-
-- critical or evidence-required document requirement counts only such a
-- document (§4). Existing rows: false (the conservative answer).
ALTER TABLE public.employee_documents
  ADD COLUMN IF NOT EXISTS filed_by_authorised boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.employee_document_person_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE sess boolean := current_user IN ('authenticated', 'anon');
BEGIN
  IF NEW.employee_id IS NOT NULL THEN
    PERFORM public.assert_same_org(NEW.company_id, 'employee_records', NEW.employee_id);
    NEW.person_id := COALESCE(public.workforce_employee_person(NEW.employee_id), NEW.person_id);
  END IF;
  IF NEW.person_id IS NOT NULL
     AND public.workforce_person_company(NEW.person_id) IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'The person belongs to another organisation' USING ERRCODE = '23514';
  END IF;
  IF sess THEN
    -- Never set by the caller; recomputed on every session write.
    NEW.filed_by_authorised := NEW.person_id IS NOT NULL
      AND public.workforce_can(NEW.company_id, 'workforce.manage')
      AND NOT public.is_me(NEW.person_id);
  ELSIF TG_OP = 'INSERT' THEN
    -- Service role: the staff upload route, or a system job.
    NEW.filed_by_authorised := NEW.person_id IS NOT NULL;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.employee_document_person_guard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_document_person_guard() TO authenticated;
DROP TRIGGER IF EXISTS employee_documents_person_guard ON public.employee_documents;
CREATE TRIGGER employee_documents_person_guard BEFORE INSERT OR UPDATE ON public.employee_documents
  FOR EACH ROW EXECUTE FUNCTION public.employee_document_person_guard();

-- ─── 3. Evidence paths belong to their own row ───────────────────────
-- (134a's guard, with the organisation re-checked after person_id is
-- derived and the evidence_path folder pinned; otherwise unchanged.)
CREATE OR REPLACE FUNCTION public.workforce_evidence_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE org uuid; sess boolean := current_user IN ('authenticated', 'anon');
        nj jsonb; oj jsonb; ekind text;
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

  -- 142: a person derived after the organisation (training_records by
  -- employee_id) must still be in that organisation; and an evidence file
  -- must sit in this row's own <org>/<kind>/<person>/ folder, or the
  -- storage read policy would hand another client's file to anyone who
  -- names it.
  nj := to_jsonb(NEW);
  IF (nj ->> 'person_id') IS NOT NULL
     AND public.workforce_person_company((nj ->> 'person_id')::uuid) IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'The person belongs to another organisation' USING ERRCODE = '23514';
  END IF;
  IF (nj ->> 'evidence_path') IS NOT NULL THEN
    ekind := CASE TG_TABLE_NAME
      WHEN 'training_records' THEN 'training' WHEN 'person_credentials' THEN 'credential'
      WHEN 'person_competencies' THEN 'competency' WHEN 'induction_completions' THEN 'induction'
      WHEN 'person_authorisations' THEN 'authorisation' WHEN 'pre_employment_checks' THEN 'pre_employment' END;
    IF ekind IS NULL OR (nj ->> 'person_id') IS NULL
       OR NOT starts_with(nj ->> 'evidence_path', NEW.company_id::text || '/' || ekind || '/' || (nj ->> 'person_id') || '/')
       OR position('/../' IN nj ->> 'evidence_path') > 0 THEN
      RAISE EXCEPTION 'The evidence file is not in this person''s folder' USING ERRCODE = '23514';
    END IF;
  END IF;

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

-- (135's guard, with the clinical document folder pinned.)
CREATE OR REPLACE FUNCTION public.health_record_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE org uuid;
BEGIN
  IF TG_OP <> 'INSERT' AND current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION 'Health records are never edited or deleted; record a new one' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  org := public.workforce_person_company(NEW.person_id);
  IF org IS NULL THEN RAISE EXCEPTION 'Unknown person' USING ERRCODE = '23503'; END IF;
  NEW.company_id := org;
  -- 142: a clinical document must sit in this row's own <org>/<person>/
  -- folder; the bucket read policy is keyed on the path a row names.
  IF (to_jsonb(NEW) ->> 'document_path') IS NOT NULL
     AND (NOT starts_with(to_jsonb(NEW) ->> 'document_path', org::text || '/' || NEW.person_id::text || '/')
          OR position('/../' IN to_jsonb(NEW) ->> 'document_path') > 0) THEN
    RAISE EXCEPTION 'The document is not in this person''s folder' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'person_health_outcomes' THEN
    PERFORM public.assert_catalogue(org, 'occupational_health_requirements', NEW.requirement_id);
  ELSIF NEW.outcome_id IS NOT NULL AND public.health_outcome_person(NEW.outcome_id) IS DISTINCT FROM NEW.person_id THEN
    RAISE EXCEPTION 'The outcome belongs to someone else' USING ERRCODE = '23514';
  END IF;
  IF current_user IN ('authenticated', 'anon') THEN
    NEW.recorded_by := auth.uid();
    IF public.is_me(NEW.person_id) THEN
      RAISE EXCEPTION 'Nobody records their own occupational health outcome' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.health_record_guard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.health_record_guard() TO authenticated;

-- Storage: a file is readable through a row only when the file sits in
-- THAT row's own organisation and person folders. Belt and braces with
-- the guards above: a row written before 142 cannot vouch for a file in
-- someone else's folder either.
DROP POLICY IF EXISTS workforce_evidence_read ON storage.objects;
CREATE POLICY workforce_evidence_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'workforce-evidence' AND (
       EXISTS (SELECT 1 FROM public.training_records r WHERE r.evidence_path = objects.name
                AND r.company_id::text = (storage.foldername(objects.name))[1] AND r.person_id::text = (storage.foldername(objects.name))[3])
    OR EXISTS (SELECT 1 FROM public.person_credentials r WHERE r.evidence_path = objects.name
                AND r.company_id::text = (storage.foldername(objects.name))[1] AND r.person_id::text = (storage.foldername(objects.name))[3])
    OR EXISTS (SELECT 1 FROM public.person_competencies r WHERE r.evidence_path = objects.name
                AND r.company_id::text = (storage.foldername(objects.name))[1] AND r.person_id::text = (storage.foldername(objects.name))[3])
    OR EXISTS (SELECT 1 FROM public.induction_completions r WHERE r.evidence_path = objects.name
                AND r.company_id::text = (storage.foldername(objects.name))[1] AND r.person_id::text = (storage.foldername(objects.name))[3])
    OR EXISTS (SELECT 1 FROM public.person_authorisations r WHERE r.evidence_path = objects.name
                AND r.company_id::text = (storage.foldername(objects.name))[1] AND r.person_id::text = (storage.foldername(objects.name))[3])
    OR EXISTS (SELECT 1 FROM public.pre_employment_checks r WHERE r.evidence_path = objects.name
                AND r.company_id::text = (storage.foldername(objects.name))[1] AND r.person_id::text = (storage.foldername(objects.name))[3])));

DROP POLICY IF EXISTS oh_clinical_read ON storage.objects;
CREATE POLICY oh_clinical_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'oh-clinical'
         AND EXISTS (SELECT 1 FROM public.occupational_health_clinical r WHERE r.document_path = objects.name
                      AND r.company_id::text = (storage.foldername(objects.name))[1]
                      AND r.person_id::text = (storage.foldername(objects.name))[2]));

-- ─── 4. The judge: organisation filter, no grace when safety-critical,
--        checked documents when checked evidence is needed ────────────
CREATE OR REPLACE FUNCTION public._wf_judge(
  p_person uuid, p_type text, p_ref uuid, p_key text, p_min_level uuid,
  p_sc boolean, p_evidence boolean, p_elearning boolean, p_validity integer, p_grace integer,
  p_as_of date, p_soon integer,
  OUT status text, OUT name text, OUT detail text, OUT evidence_date date, OUT expires_on date, OUT next_edge date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  need_verified boolean := COALESCE(p_evidence, false) OR COALESCE(p_sc, false);
  months integer; rank_needed integer; rank_have integer; lvl_label text;
  d1 date; d2 date; v text; vat timestamptz; oc text; sus_from timestamptz; cnt integer;
  -- 142: evidence counts only inside the person's own organisation, and a
  -- safety-critical item gets no grace once it has expired.
  org uuid := (SELECT company_id FROM people WHERE id = p_person);
  g integer := CASE WHEN COALESCE(p_sc, false) THEN 0 ELSE p_grace END;
BEGIN
  CASE p_type
  WHEN 'training' THEN
    SELECT c.title, c.validity_months INTO name, months FROM training_courses c WHERE c.id = p_ref;
    -- The latest completion that can count; if verification is needed, the
    -- latest VERIFIED one (verified by as_of). An unverified newer record
    -- never hides an older verified one.
    SELECT t.completed_on, COALESCE(t.expires_on,
             CASE WHEN COALESCE(p_validity, months) IS NOT NULL
                  THEN (t.completed_on + make_interval(months => COALESCE(p_validity, months)))::date END)
      INTO d1, d2
      FROM training_records t
     WHERE t.person_id = p_person AND t.company_id = org AND t.course_id = p_ref AND t.completed_on <= p_as_of AND t.result = 'pass'
       AND t.verification_status <> 'rejected' AND (t.source <> 'elearning' OR p_elearning)
       AND (NOT need_verified OR (t.verification_status = 'verified' AND t.verified_at::date <= p_as_of))
     ORDER BY t.completed_on DESC, t.created_at DESC LIMIT 1;
    IF d1 IS NULL THEN
      SELECT count(*) INTO cnt FROM training_records t
       WHERE t.person_id = p_person AND t.company_id = org AND t.course_id = p_ref AND t.completed_on <= p_as_of AND t.result = 'pass'
         AND t.verification_status <> 'rejected' AND (t.source <> 'elearning' OR p_elearning);
      IF cnt > 0 THEN status := 'review'; detail := 'Completion recorded, awaiting verification';
      ELSE status := 'unmet'; detail := 'No completion on record'; END IF;
      RETURN;
    END IF;
    evidence_date := d1; expires_on := d2;

  WHEN 'competency' THEN
    SELECT c.title, c.renewal_months INTO name, months FROM competencies c WHERE c.id = p_ref;
    SELECT l.rank, l.label INTO rank_needed, lvl_label FROM competency_levels l WHERE l.id = p_min_level;
    name := name || ' (' || lvl_label || ')';
    SELECT s.suspended_at INTO sus_from FROM competency_suspensions s
     WHERE s.person_id = p_person AND s.company_id = org AND s.competency_id = p_ref AND s.suspended_at::date <= p_as_of
       AND (s.lifted_at IS NULL OR s.lifted_at::date > p_as_of)
     ORDER BY s.suspended_at DESC LIMIT 1;
    IF sus_from IS NOT NULL THEN
      status := 'unmet'; detail := 'Suspended since ' || to_char(sus_from AT TIME ZONE 'Europe/London', 'DD Mon YYYY'); RETURN;
    END IF;
    -- The latest VERIFIED assessment decides the level (a later, lower
    -- assessment is a downgrade). Competence is never inferred from
    -- training: nothing here reads training_records.
    SELECT pc.assessed_on, COALESCE(pc.expires_on, CASE WHEN months IS NOT NULL
             THEN (pc.assessed_on + make_interval(months => months))::date END), l.rank
      INTO d1, d2, rank_have
      FROM person_competencies pc JOIN competency_levels l ON l.id = pc.level_id
     WHERE pc.person_id = p_person AND pc.company_id = org AND pc.competency_id = p_ref AND pc.assessed_on <= p_as_of
       AND pc.verification_status = 'verified' AND pc.verified_at::date <= p_as_of
     ORDER BY pc.assessed_on DESC, pc.created_at DESC LIMIT 1;
    IF d1 IS NULL THEN
      SELECT count(*) INTO cnt FROM person_competencies pc
       WHERE pc.person_id = p_person AND pc.company_id = org AND pc.competency_id = p_ref AND pc.assessed_on <= p_as_of
         AND pc.verification_status = 'unverified';
      IF cnt > 0 THEN status := 'review'; detail := 'Assessment recorded, awaiting verification';
      ELSE status := 'unmet'; detail := 'Not assessed'; END IF;
      RETURN;
    END IF;
    evidence_date := d1; expires_on := d2;
    IF rank_have < rank_needed THEN
      status := 'unmet';
      detail := 'Assessed at ' || (SELECT label FROM competency_levels WHERE company_id IS NOT DISTINCT FROM
                  (SELECT company_id FROM competency_levels WHERE id = p_min_level) AND rank = rank_have LIMIT 1)
                || '; ' || lvl_label || ' required';
      RETURN;
    END IF;

  WHEN 'qualification', 'certification', 'licence', 'card', 'permit' THEN
    SELECT c.title, c.validity_months INTO name, months FROM credential_types c WHERE c.id = p_ref;
    SELECT COALESCE(pc.issued_on, pc.created_at::date),
           COALESCE(pc.expires_on, CASE WHEN months IS NOT NULL AND pc.issued_on IS NOT NULL
             THEN (pc.issued_on + make_interval(months => months))::date END)
      INTO d1, d2
      FROM person_credentials pc
     WHERE pc.person_id = p_person AND pc.company_id = org AND pc.credential_type_id = p_ref
       AND COALESCE(pc.issued_on, pc.created_at::date) <= p_as_of AND pc.verification_status <> 'rejected'
       AND (NOT need_verified OR (pc.verification_status = 'verified' AND pc.verified_at::date <= p_as_of))
     ORDER BY COALESCE(pc.expires_on, 'infinity'::date) DESC, pc.created_at DESC LIMIT 1;
    IF d1 IS NULL THEN
      SELECT count(*) INTO cnt FROM person_credentials pc
       WHERE pc.person_id = p_person AND pc.company_id = org AND pc.credential_type_id = p_ref
         AND COALESCE(pc.issued_on, pc.created_at::date) <= p_as_of AND pc.verification_status = 'unverified';
      IF cnt > 0 THEN status := 'review'; detail := 'Evidence submitted, awaiting verification';
      ELSE status := 'unmet'; detail := 'None on record'; END IF;
      RETURN;
    END IF;
    evidence_date := d1; expires_on := d2;

  WHEN 'induction' THEN
    SELECT t.title, t.reinduction_months INTO name, months FROM induction_templates t WHERE t.id = p_ref;
    SELECT ic.completed_on, COALESCE(ic.reinduction_due, CASE WHEN months IS NOT NULL
             THEN (ic.completed_on + make_interval(months => months))::date END)
      INTO d1, d2
      FROM induction_completions ic
     WHERE ic.person_id = p_person AND ic.company_id = org AND ic.induction_template_id = p_ref AND ic.completed_on <= p_as_of
     ORDER BY ic.completed_on DESC, ic.created_at DESC LIMIT 1;
    IF d1 IS NULL THEN status := 'unmet'; detail := 'Induction not completed'; RETURN; END IF;
    evidence_date := d1; expires_on := d2;

  WHEN 'medical' THEN
    SELECT r.title, r.frequency_months INTO name, months FROM occupational_health_requirements r WHERE r.id = p_ref;
    SELECT o.assessed_on, COALESCE(o.review_date, CASE WHEN months IS NOT NULL
             THEN (o.assessed_on + make_interval(months => months))::date END), o.outcome
      INTO d1, d2, oc
      FROM person_health_outcomes o
     WHERE o.person_id = p_person AND o.company_id = org AND o.requirement_id = p_ref AND o.assessed_on <= p_as_of
     ORDER BY o.assessed_on DESC, o.created_at DESC LIMIT 1;
    IF d1 IS NULL THEN status := 'unmet'; detail := 'No assessment on record'; RETURN; END IF;
    evidence_date := d1; expires_on := d2;
    IF oc IN ('temporarily_unfit','unfit') THEN
      status := 'unmet'; detail := 'Not fit for this work at last assessment — see occupational health'; RETURN;
    ELSIF oc = 'further_assessment_required' THEN
      status := 'review'; detail := 'Further assessment required — see occupational health'; RETURN;
    END IF;
    status := public._wf_expiry_status(d2, g, p_as_of, p_soon);
    next_edge := public._wf_next_edge(d2, g, p_as_of, p_soon);
    IF status <> 'unmet' AND oc = 'fit_with_restrictions' THEN
      status := 'met_with_restrictions'; detail := 'Fit with restrictions — see occupational health';
    ELSIF status = 'unmet' THEN
      detail := 'Review overdue since ' || to_char(d2, 'DD Mon YYYY');
    END IF;
    RETURN;

  WHEN 'authorisation' THEN
    SELECT t.title, t.validity_months INTO name, months FROM authorisation_types t WHERE t.id = p_ref;
    SELECT a.issued_on, COALESCE(a.expires_on, CASE WHEN months IS NOT NULL
             THEN (a.issued_on + make_interval(months => months))::date END),
           (SELECT s.suspended_at FROM authorisation_suspensions s
             WHERE s.authorisation_id = a.id AND s.suspended_at::date <= p_as_of
               AND (s.lifted_at IS NULL OR s.lifted_at::date > p_as_of) LIMIT 1)
      INTO d1, d2, sus_from
      FROM person_authorisations a
     WHERE a.person_id = p_person AND a.company_id = org AND a.authorisation_type_id = p_ref AND a.issued_on <= p_as_of
       AND (a.revoked_at IS NULL OR a.revoked_at::date > p_as_of)
       AND (a.scope_site_id IS NULL OR a.scope_site_id IN (
             SELECT ra.site_id FROM role_assignments ra WHERE ra.person_id = p_person
                AND ra.start_date <= p_as_of AND (ra.end_date IS NULL OR ra.end_date >= p_as_of)))
     ORDER BY (SELECT count(*) FROM authorisation_suspensions s WHERE s.authorisation_id = a.id
                AND s.suspended_at::date <= p_as_of AND (s.lifted_at IS NULL OR s.lifted_at::date > p_as_of)),
              COALESCE(a.expires_on, 'infinity'::date) DESC LIMIT 1;
    IF d1 IS NULL THEN status := 'unmet'; detail := 'Not authorised'; RETURN; END IF;
    evidence_date := d1; expires_on := d2;
    IF sus_from IS NOT NULL THEN
      status := 'unmet'; detail := 'Suspended since ' || to_char(sus_from AT TIME ZONE 'Europe/London', 'DD Mon YYYY'); RETURN;
    END IF;

  WHEN 'ppe' THEN
    SELECT t.title INTO name FROM ppe_types t WHERE t.id = p_ref;
    SELECT i.issued_on, i.replacement_due INTO d1, d2 FROM ppe_issues i
     WHERE i.person_id = p_person AND i.company_id = org AND i.ppe_type_id = p_ref AND i.issued_on <= p_as_of
       AND (i.returned_on IS NULL OR i.returned_on > p_as_of)
     ORDER BY i.issued_on DESC LIMIT 1;
    IF d1 IS NULL THEN status := 'unmet'; detail := 'Not issued'; RETURN; END IF;
    evidence_date := d1; expires_on := d2;

  WHEN 'document' THEN
    name := initcap(replace(p_key, '_', ' '));
    SELECT d.created_at::date, d.expiry_date INTO d1, d2 FROM employee_documents d
     WHERE d.person_id = p_person AND d.company_id = org AND d.doc_type = p_key AND d.status = 'active'
       AND d.created_at::date <= p_as_of
       -- 142: when the requirement needs checked evidence, only a document
       -- filed by someone with workforce authority (never the worker) counts.
       AND (NOT need_verified OR d.filed_by_authorised)
     ORDER BY COALESCE(d.expiry_date, 'infinity'::date) DESC LIMIT 1;
    IF d1 IS NULL THEN
      SELECT count(*) INTO cnt FROM employee_documents d
       WHERE d.person_id = p_person AND d.company_id = org AND d.doc_type = p_key AND d.status = 'active'
         AND d.created_at::date <= p_as_of;
      IF cnt > 0 THEN status := 'review'; detail := 'Document on file, awaiting a check by someone with workforce authority';
      ELSE status := 'unmet'; detail := 'Document not on file'; END IF;
      RETURN;
    END IF;
    evidence_date := d1; expires_on := d2;

  WHEN 'pre_employment_check' THEN
    SELECT t.title INTO name FROM pre_employment_check_types t WHERE t.id = p_ref;
    SELECT c.status, c.verified_at INTO v, vat FROM pre_employment_checks c
     WHERE c.person_id = p_person AND c.company_id = org AND c.check_type_id = p_ref;
    IF v IN ('verified','waived') AND vat::date <= p_as_of THEN
      status := 'met'; evidence_date := vat::date;
      detail := CASE WHEN v = 'waived' THEN 'Waived (approved)' END;
    ELSIF v = 'failed' AND vat::date <= p_as_of THEN
      status := 'unmet'; detail := 'Check failed';
    ELSE
      status := 'unmet'; detail := 'Outstanding (' || COALESCE(v, 'not started') || ')';
    END IF;
    RETURN;
  END CASE;

  status := public._wf_expiry_status(expires_on, g, p_as_of, p_soon);
  next_edge := public._wf_next_edge(expires_on, g, p_as_of, p_soon);
  detail := CASE
    WHEN status = 'unmet' THEN 'Expired ' || to_char(expires_on, 'DD Mon YYYY')
    WHEN status = 'expiring' AND p_as_of > expires_on THEN 'Expired ' || to_char(expires_on, 'DD Mon YYYY') || ' — in grace period'
    WHEN status = 'expiring' THEN 'Expires ' || to_char(expires_on, 'DD Mon YYYY')
    WHEN expires_on IS NOT NULL THEN 'Valid until ' || to_char(expires_on, 'DD Mon YYYY')
    ELSE 'No expiry' END;
END $$;

-- ─── 5. Two catalogues that never marked statuses stale ──────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ppe_types','pre_employment_check_types'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_wf_dirty ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_wf_dirty AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.workforce_mark_dirty(%2$L)', t, 'company');
  END LOOP;
END $$;

-- Cached answers were computed with the old judge.
UPDATE public.person_deployment_status SET dirty = true WHERE NOT dirty;
