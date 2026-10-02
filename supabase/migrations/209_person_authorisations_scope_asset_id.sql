-- ═══════════════════════════════════════════════════════════════════
-- 209: person_authorisations.scope_asset_id — closes a real,
-- documented gap (go-live gap list, item 4, 2026-10-02)
-- ═══════════════════════════════════════════════════════════════════
--
-- 152's own header comment named this exact gap: "No scope_asset_id
-- exists on authorisation_types — a real, documented limitation, not
-- a silent omission." Checked before writing a line of SQL: the gap
-- is not actually on `authorisation_types` (the TYPE catalogue, which
-- already has its own `scope_kind` classification, 133) — it is on
-- `person_authorisations` (the per-GRANT row), which already carries
-- `scope_site_id` (134) but no equivalent `scope_asset_id`. A permit
-- for "authorised to operate THIS specific crane" could never be
-- checked, only "authorised at THIS site" (scope_site_id IS NULL
-- still means "any site/asset", 133's own convention, unchanged).
--
-- `scope_site_id` is REFERENCES hs_sites(id) ON DELETE SET NULL — this
-- column mirrors that exactly, against hs_equipment(id).
ALTER TABLE public.person_authorisations
  ADD COLUMN IF NOT EXISTS scope_asset_id uuid REFERENCES public.hs_equipment(id) ON DELETE SET NULL;

-- ── workforce_evidence_guard(): same-organisation check for the new
--    column, the exact pattern its own scope_site_id line already
--    uses. Live body read via pg_get_functiondef() immediately before
--    writing this — this codebase's own standing rule — and
--    reproduced here verbatim plus the one new line, never guessed
--    from an older migration file. Same signature, so this CREATE OR
--    REPLACE is a plain in-place function replacement with zero
--    overload risk. ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.workforce_evidence_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
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
      -- 209: the same same-organisation check, for the new asset scope.
      PERFORM public.assert_same_org(NEW.company_id, 'hs_equipment', NEW.scope_asset_id);
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

-- ── person_holds_authorisation_with_asset(): a NEW function, never a
--    CREATE OR REPLACE adding a 5th parameter to the existing
--    person_holds_authorisation(uuid,uuid,uuid,date) — a rolled-back
--    live probe proved that shape creates an ambiguous, COEXISTING
--    overload (`function ... is not unique`) rather than cleanly
--    replacing it, and this environment's DDL path cannot run
--    DROP FUNCTION reliably either (confirmed live, repeatedly — the
--    exact same transient-looking but actually consistent limitation
--    this file's own history already records for DROP TABLE on
--    migration 203). A new, explicitly-named function sidesteps both
--    problems and leaves the original 4-arg function, and its one real
--    caller's signature expectations, completely untouched. ──────────
CREATE FUNCTION public.person_holds_authorisation_with_asset(
  p_person_id uuid, p_type_id uuid, p_site_id uuid, p_asset_id uuid, p_as_of date DEFAULT NULL
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.person_authorisations pa
     WHERE pa.person_id = p_person_id
       AND pa.authorisation_type_id = p_type_id
       AND pa.status = 'active'
       AND pa.issued_on <= COALESCE(p_as_of, public.workforce_today())
       AND (pa.expires_on IS NULL OR pa.expires_on >= COALESCE(p_as_of, public.workforce_today()))
       AND (pa.scope_site_id IS NULL OR pa.scope_site_id = p_site_id)
       AND (pa.scope_asset_id IS NULL OR pa.scope_asset_id = p_asset_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.authorisation_suspensions s
          WHERE s.authorisation_id = pa.id AND s.lifted_at IS NULL
       )
  )
$$;
REVOKE ALL ON FUNCTION public.person_holds_authorisation_with_asset(uuid, uuid, uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_holds_authorisation_with_asset(uuid, uuid, uuid, uuid, date) TO authenticated;

-- ── permits_lifecycle_guard(): its one authorisation check now also
--    passes the permit's own NEW.asset_id through — a permit with no
--    asset passes NULL, which the new function's own (scope_asset_id
--    IS NULL OR ...) clause treats exactly like "any asset", so every
--    existing asset-less permit's behaviour is completely unchanged.
--    Live body read via pg_get_functiondef() immediately before
--    writing this, reproduced verbatim plus the one changed call —
--    same signature (a no-arg trigger function), zero overload risk. ──
CREATE OR REPLACE FUNCTION public.permits_lifecycle_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  tmpl record;
  bad_person uuid;
  hours integer;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'issued' AND OLD.status IN ('draft', 'suspended') THEN
      -- Live re-check, every time — a suspension may have existed for
      -- exactly the reason this check would catch, so revalidation runs
      -- the identical checks as a first issue, never a bare flag flip.
      IF NEW.asset_id IS NOT NULL THEN
        IF EXISTS (SELECT 1 FROM public.hs_equipment WHERE id = NEW.asset_id AND status = 'quarantined') THEN
          RAISE EXCEPTION 'This asset is quarantined and cannot be covered by an issued permit' USING ERRCODE = '23514';
        END IF;
      END IF;

      -- Nobody approves their own work: the person issuing this permit
      -- may not also be the person named as authorising it. Only fires
      -- when the acting session is itself linked to a people row —
      -- staff administering the record on a contractor's behalf are
      -- never blocked by this.
      IF NEW.authorised_person_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM public.people WHERE id = NEW.authorised_person_id AND user_id = auth.uid()) THEN
        RAISE EXCEPTION 'The person issuing this permit cannot also be the authorising person' USING ERRCODE = '23514';
      END IF;

      SELECT required_authorisation_type_id INTO tmpl FROM public.permit_templates WHERE id = NEW.template_id;
      IF tmpl.required_authorisation_type_id IS NOT NULL THEN
        IF NEW.authorised_person_id IS NULL
           OR NOT public.person_holds_authorisation_with_asset(NEW.authorised_person_id, tmpl.required_authorisation_type_id, NEW.site_id, NEW.asset_id) THEN
          RAISE EXCEPTION 'The authorising person does not hold the required authorisation for this permit type' USING ERRCODE = '23514';
        END IF;
      END IF;

      SELECT pp.person_id INTO bad_person FROM public.permit_people pp
        WHERE pp.permit_id = NEW.id
          AND COALESCE((public.person_deployment_status(pp.person_id, public.workforce_today()) ->> 'status'), 'REVIEW_REQUIRED') <> 'READY'
        LIMIT 1;
      IF bad_person IS NOT NULL THEN
        RAISE EXCEPTION 'A person named on this permit is not currently Safe to Deploy' USING ERRCODE = '23514';
      END IF;

      IF OLD.status = 'draft' THEN
        NEW.issued_by := COALESCE(NEW.issued_by, auth.uid());
        NEW.issued_at := now();
        NEW.valid_from := COALESCE(NEW.valid_from, now());
        IF NEW.valid_until IS NULL THEN
          SELECT default_validity_hours INTO hours FROM public.permit_templates WHERE id = NEW.template_id;
          NEW.valid_until := NEW.valid_from + make_interval(hours => COALESCE(hours, 8));
        END IF;
      ELSE
        NEW.revalidated_by := COALESCE(NEW.revalidated_by, auth.uid());
        NEW.revalidated_at := now();
        NEW.suspended_at := NULL; NEW.suspended_by := NULL; NEW.suspended_reason := NULL;
      END IF;

    ELSIF NEW.status = 'suspended' AND OLD.status = 'issued' THEN
      IF length(btrim(COALESCE(NEW.suspended_reason, ''))) = 0 THEN
        RAISE EXCEPTION 'Say why the permit is being suspended' USING ERRCODE = '23514';
      END IF;
      NEW.suspended_by := COALESCE(NEW.suspended_by, auth.uid());
      NEW.suspended_at := now();

    ELSIF NEW.status = 'closed' AND OLD.status IN ('issued', 'suspended') THEN
      IF length(btrim(COALESCE(NEW.closeout_notes, ''))) = 0 THEN
        RAISE EXCEPTION 'Add closeout notes before closing a permit' USING ERRCODE = '23514';
      END IF;
      NEW.closed_by := COALESCE(NEW.closed_by, auth.uid());
      NEW.closed_at := now();

    ELSIF NEW.status = 'revoked' AND OLD.status <> 'closed' AND OLD.status <> 'revoked' THEN
      IF length(btrim(COALESCE(NEW.revoked_reason, ''))) = 0 THEN
        RAISE EXCEPTION 'Say why the permit is being revoked' USING ERRCODE = '23514';
      END IF;
      NEW.revoked_by := COALESCE(NEW.revoked_by, auth.uid());
      NEW.revoked_at := now();

    ELSE
      RAISE EXCEPTION 'Cannot move a permit from % to %', OLD.status, NEW.status USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.permits_lifecycle_guard() FROM PUBLIC, anon, authenticated;
