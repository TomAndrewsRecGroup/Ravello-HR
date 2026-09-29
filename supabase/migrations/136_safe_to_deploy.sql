-- ═══════════════════════════════════════════════════════════════════
-- 136: Core-OS 360 Phase 3 — Safe to Deploy (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- Plan §6. "Is this person competent, trained, medically suitable where
-- required, authorised and ready to perform this role safely today?"
-- answered deterministically, from evidence, with every reason shown.
-- No score, no prediction, no AI.
--
--   _wf_requirements(person, as_of)   the consolidated requirement set:
--       every rule in force on as_of from every role and site the person
--       is assigned to on as_of, plus their own rules; one row per
--       (type, reference), keeping the strictest settings and every source.
--   _wf_deployment(person, as_of)     judges each requirement against its
--       evidence ON as_of (evidence dates, verification dates, suspension
--       and exception windows), then:
--         any mandatory unmet            → NOT_READY
--         else any mandatory for review  → REVIEW_REQUIRED
--         else any exception / restriction → CONDITIONALLY_READY
--         else                           → READY
--       Not an active worker → NOT_READY. No role → REVIEW_REQUIRED.
--   person_deployment_status(person, as_of)  the public read: visibility
--       checked, and ANY failure while calculating is REVIEW_REQUIRED —
--       never READY (spec 109).
--
-- SAFETY-CRITICAL: a requirement is safety-critical when its rule says
-- so, when its catalogue item is (course, competency, authorisation, OH
-- requirement), or when it is mandatory for a safety-critical role.
-- Unverified evidence never satisfies a safety-critical or
-- evidence-required requirement; it puts the person in review. Only a
-- time-limited exception approved under deployment.exception.approve
-- can stand in for it, and that makes the result CONDITIONALLY_READY,
-- never READY.
--
-- NEVER STALE (spec 116): person_deployment_status caches a result with
-- valid_until (the next date an expiry, grace, "expiring soon" edge,
-- gate or exception changes the answer). Every input table marks the
-- affected people dirty. A read uses the cache only when it is clean and
-- still valid; otherwise it calculates live. The cron's
-- workforce_refresh_due() recalculates and writes each transition to
-- deployment_status_log (insert-only; statuses and requirement names,
-- no clinical text).
--
-- MEDICAL: the engine reads outcomes directly and exposes only the
-- category ("met with restrictions — see occupational health"). The
-- restriction text and anything clinical never enter the result.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Settings and time ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.workforce_settings (
  company_id         uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  expiring_soon_days integer NOT NULL DEFAULT 30 CHECK (expiring_soon_days BETWEEN 1 AND 180),
  reminder_offsets   integer[] NOT NULL DEFAULT '{90,60,30,14,7}',
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (array_length(reminder_offsets, 1) BETWEEN 1 AND 8 AND 0 < ALL (reminder_offsets) AND 366 > ALL (reminder_offsets))
);
DROP TRIGGER IF EXISTS workforce_settings_updated_at ON public.workforce_settings;
CREATE TRIGGER workforce_settings_updated_at BEFORE UPDATE ON public.workforce_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
ALTER TABLE public.workforce_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workforce_settings_read ON public.workforce_settings;
CREATE POLICY workforce_settings_read ON public.workforce_settings FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()) OR (SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS workforce_settings_manage ON public.workforce_settings;
CREATE POLICY workforce_settings_manage ON public.workforce_settings FOR ALL TO authenticated
  USING (public.workforce_can(company_id, 'workforce.manage')) WITH CHECK (public.workforce_can(company_id, 'workforce.manage'));
SELECT public.apply_write_guard('public.workforce_settings');
DROP TRIGGER IF EXISTS workforce_settings_audit ON public.workforce_settings;
CREATE TRIGGER workforce_settings_audit AFTER INSERT OR UPDATE OR DELETE ON public.workforce_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('workforce_settings', 'company_id', 'expiring_soon_days', 'reminder_offsets');

-- One definition of "today" for workforce compliance: the UK calendar
-- date (server time, never the browser's).
CREATE OR REPLACE FUNCTION public.workforce_today()
RETURNS date LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT (now() AT TIME ZONE 'Europe/London')::date
$$;
GRANT EXECUTE ON FUNCTION public.workforce_today() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._wf_soon_days(p_org uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT expiring_soon_days FROM workforce_settings WHERE company_id = p_org), 30)
$$;

-- met | expiring | unmet, from an expiry date. Grace keeps a lapsed item
-- counted (flagged) for grace_days after it expires.
CREATE OR REPLACE FUNCTION public._wf_expiry_status(p_expires date, p_grace integer, p_as_of date, p_soon integer)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p_expires IS NULL                                   THEN 'met'
    WHEN p_as_of > p_expires + COALESCE(p_grace, 0)          THEN 'unmet'
    WHEN p_as_of > p_expires                                 THEN 'expiring'
    WHEN p_expires - p_as_of <= p_soon                       THEN 'expiring'
    ELSE 'met' END
$$;

-- The next date on which an expiry changes its status (for the cache).
CREATE OR REPLACE FUNCTION public._wf_next_edge(p_expires date, p_grace integer, p_as_of date, p_soon integer)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE WHEN p_expires IS NULL THEN NULL
              WHEN p_as_of < p_expires - p_soon THEN p_expires - p_soon
              WHEN p_as_of <= p_expires + COALESCE(p_grace, 0) THEN p_expires + COALESCE(p_grace, 0) + 1
              ELSE NULL END
$$;

-- ─── 2. The requirement set ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._wf_requirements(p_person uuid, p_as_of date)
RETURNS TABLE (requirement_type text, reference_id uuid, reference_key text, min_level_id uuid,
               mandatory boolean, safety_critical boolean, evidence_required boolean, allow_elearning boolean,
               validity_months integer, grace_days integer, required_by date, sources jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH asg AS (
    SELECT a.id, a.role_id, a.site_id FROM role_assignments a
     WHERE a.person_id = p_person AND a.start_date <= p_as_of AND (a.end_date IS NULL OR a.end_date >= p_as_of)
  ), rules AS (
    SELECT 'role'::text AS scope, r.id AS rule_id, r.role_id AS scope_id, r.requirement_type, r.reference_id, r.reference_key,
           r.min_level_id, r.mandatory, (r.safety_critical OR (jr.safety_critical AND r.mandatory)) AS sc, r.evidence_required,
           r.allow_elearning, r.validity_months, r.grace_days, r.required_by
      FROM asg JOIN role_requirements r ON r.role_id = asg.role_id JOIN job_roles jr ON jr.id = r.role_id
     WHERE r.effective_from IS NOT NULL AND r.effective_from <= p_as_of AND (r.effective_until IS NULL OR r.effective_until >= p_as_of)
    UNION ALL
    SELECT 'site', r.id, r.site_id, r.requirement_type, r.reference_id, r.reference_key, r.min_level_id, r.mandatory,
           r.safety_critical, r.evidence_required, r.allow_elearning, r.validity_months, r.grace_days, r.required_by
      FROM (SELECT DISTINCT site_id FROM asg WHERE site_id IS NOT NULL) s JOIN site_requirements r ON r.site_id = s.site_id
     WHERE r.effective_from IS NOT NULL AND r.effective_from <= p_as_of AND (r.effective_until IS NULL OR r.effective_until >= p_as_of)
    UNION ALL
    SELECT 'person', r.id, r.person_id, r.requirement_type, r.reference_id, r.reference_key, r.min_level_id, r.mandatory,
           r.safety_critical, r.evidence_required, r.allow_elearning, r.validity_months, r.grace_days, r.required_by
      FROM person_requirements r
     WHERE r.person_id = p_person
       AND r.effective_from IS NOT NULL AND r.effective_from <= p_as_of AND (r.effective_until IS NULL OR r.effective_until >= p_as_of)
  )
  SELECT r.requirement_type, r.reference_id, r.reference_key,
         (array_agg(r.min_level_id ORDER BY l.rank DESC NULLS LAST))[1],
         bool_or(r.mandatory), bool_or(r.sc), bool_or(r.evidence_required), bool_and(r.allow_elearning),
         min(r.validity_months), min(r.grace_days), min(r.required_by),
         jsonb_agg(jsonb_build_object('scope', r.scope, 'scope_id', r.scope_id, 'rule_id', r.rule_id) ORDER BY r.scope)
    FROM rules r LEFT JOIN competency_levels l ON l.id = r.min_level_id
   GROUP BY r.requirement_type, r.reference_id, r.reference_key
$$;

-- ─── 3. Judging one requirement ─────────────────────────────────────
-- Returns status (met | expiring | met_with_restrictions | unmet | review),
-- a display name, a factual detail line, the evidence date, the expiry
-- and the next date the answer changes. Never returns medical text.

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
     WHERE t.person_id = p_person AND t.course_id = p_ref AND t.completed_on <= p_as_of AND t.result = 'pass'
       AND t.verification_status <> 'rejected' AND (t.source <> 'elearning' OR p_elearning)
       AND (NOT need_verified OR (t.verification_status = 'verified' AND t.verified_at::date <= p_as_of))
     ORDER BY t.completed_on DESC, t.created_at DESC LIMIT 1;
    IF d1 IS NULL THEN
      SELECT count(*) INTO cnt FROM training_records t
       WHERE t.person_id = p_person AND t.course_id = p_ref AND t.completed_on <= p_as_of AND t.result = 'pass'
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
     WHERE s.person_id = p_person AND s.competency_id = p_ref AND s.suspended_at::date <= p_as_of
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
     WHERE pc.person_id = p_person AND pc.competency_id = p_ref AND pc.assessed_on <= p_as_of
       AND pc.verification_status = 'verified' AND pc.verified_at::date <= p_as_of
     ORDER BY pc.assessed_on DESC, pc.created_at DESC LIMIT 1;
    IF d1 IS NULL THEN
      SELECT count(*) INTO cnt FROM person_competencies pc
       WHERE pc.person_id = p_person AND pc.competency_id = p_ref AND pc.assessed_on <= p_as_of
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
     WHERE pc.person_id = p_person AND pc.credential_type_id = p_ref
       AND COALESCE(pc.issued_on, pc.created_at::date) <= p_as_of AND pc.verification_status <> 'rejected'
       AND (NOT need_verified OR (pc.verification_status = 'verified' AND pc.verified_at::date <= p_as_of))
     ORDER BY COALESCE(pc.expires_on, 'infinity'::date) DESC, pc.created_at DESC LIMIT 1;
    IF d1 IS NULL THEN
      SELECT count(*) INTO cnt FROM person_credentials pc
       WHERE pc.person_id = p_person AND pc.credential_type_id = p_ref
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
     WHERE ic.person_id = p_person AND ic.induction_template_id = p_ref AND ic.completed_on <= p_as_of
     ORDER BY ic.completed_on DESC, ic.created_at DESC LIMIT 1;
    IF d1 IS NULL THEN status := 'unmet'; detail := 'Induction not completed'; RETURN; END IF;
    evidence_date := d1; expires_on := d2;

  WHEN 'medical' THEN
    SELECT r.title, r.frequency_months INTO name, months FROM occupational_health_requirements r WHERE r.id = p_ref;
    SELECT o.assessed_on, COALESCE(o.review_date, CASE WHEN months IS NOT NULL
             THEN (o.assessed_on + make_interval(months => months))::date END), o.outcome
      INTO d1, d2, oc
      FROM person_health_outcomes o
     WHERE o.person_id = p_person AND o.requirement_id = p_ref AND o.assessed_on <= p_as_of
     ORDER BY o.assessed_on DESC, o.created_at DESC LIMIT 1;
    IF d1 IS NULL THEN status := 'unmet'; detail := 'No assessment on record'; RETURN; END IF;
    evidence_date := d1; expires_on := d2;
    IF oc IN ('temporarily_unfit','unfit') THEN
      status := 'unmet'; detail := 'Not fit for this work at last assessment — see occupational health'; RETURN;
    ELSIF oc = 'further_assessment_required' THEN
      status := 'review'; detail := 'Further assessment required — see occupational health'; RETURN;
    END IF;
    status := public._wf_expiry_status(d2, p_grace, p_as_of, p_soon);
    next_edge := public._wf_next_edge(d2, p_grace, p_as_of, p_soon);
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
     WHERE a.person_id = p_person AND a.authorisation_type_id = p_ref AND a.issued_on <= p_as_of
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
     WHERE i.person_id = p_person AND i.ppe_type_id = p_ref AND i.issued_on <= p_as_of
       AND (i.returned_on IS NULL OR i.returned_on > p_as_of)
     ORDER BY i.issued_on DESC LIMIT 1;
    IF d1 IS NULL THEN status := 'unmet'; detail := 'Not issued'; RETURN; END IF;
    evidence_date := d1; expires_on := d2;

  WHEN 'document' THEN
    name := initcap(replace(p_key, '_', ' '));
    SELECT d.created_at::date, d.expiry_date INTO d1, d2 FROM employee_documents d
     WHERE d.person_id = p_person AND d.doc_type = p_key AND d.status = 'active' AND d.created_at::date <= p_as_of
     ORDER BY COALESCE(d.expiry_date, 'infinity'::date) DESC LIMIT 1;
    IF d1 IS NULL THEN status := 'unmet'; detail := 'Document not on file'; RETURN; END IF;
    evidence_date := d1; expires_on := d2;

  WHEN 'pre_employment_check' THEN
    SELECT t.title INTO name FROM pre_employment_check_types t WHERE t.id = p_ref;
    SELECT c.status, c.verified_at INTO v, vat FROM pre_employment_checks c
     WHERE c.person_id = p_person AND c.check_type_id = p_ref;
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

  status := public._wf_expiry_status(expires_on, p_grace, p_as_of, p_soon);
  next_edge := public._wf_next_edge(expires_on, p_grace, p_as_of, p_soon);
  detail := CASE
    WHEN status = 'unmet' THEN 'Expired ' || to_char(expires_on, 'DD Mon YYYY')
    WHEN status = 'expiring' AND p_as_of > expires_on THEN 'Expired ' || to_char(expires_on, 'DD Mon YYYY') || ' — in grace period'
    WHEN status = 'expiring' THEN 'Expires ' || to_char(expires_on, 'DD Mon YYYY')
    WHEN expires_on IS NOT NULL THEN 'Valid until ' || to_char(expires_on, 'DD Mon YYYY')
    ELSE 'No expiry' END;
END $$;

-- ─── 4. The whole person ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._wf_deployment(p_person uuid, p_as_of date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  p people%ROWTYPE; soon integer; req record; j record; ex record;
  items jsonb := '[]'::jsonb; reasons jsonb := '[]'::jsonb;
  n_req int := 0; n_met int := 0; n_unmet int := 0; n_review int := 0; n_cond int := 0; n_exp int := 0;
  sc_gap boolean := false; until date := NULL; st text; det text; overall text;
  is_today boolean := p_as_of = public.workforce_today();
  gate record; start_d date;
BEGIN
  SELECT * INTO p FROM people WHERE id = p_person;
  IF NOT FOUND THEN RAISE EXCEPTION 'Person not found' USING ERRCODE = 'P0002'; END IF;
  soon := public._wf_soon_days(p.company_id);

  -- Lifecycle is current state; it decides only "today" (past dates are
  -- judged from assignments, which end with the person).
  IF is_today AND p.lifecycle_status NOT IN ('pre_employment','active','notice') THEN
    RETURN jsonb_build_object('person_id', p.id, 'company_id', p.company_id, 'as_of', p_as_of, 'status', 'NOT_READY',
      'computed_at', now(), 'valid_until', NULL,
      'reasons', jsonb_build_array(jsonb_build_object('code', 'not_active',
                 'text', 'Not an active worker (' || replace(p.lifecycle_status, '_', ' ') || ')')),
      'summary', jsonb_build_object('required', 0, 'met', 0, 'unmet', 0, 'review', 0, 'conditional', 0, 'expiring', 0,
                                    'safety_critical_gap', false),
      'requirements', '[]'::jsonb);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM role_assignments a WHERE a.person_id = p_person AND a.start_date <= p_as_of
                   AND (a.end_date IS NULL OR a.end_date >= p_as_of)) THEN
    RETURN jsonb_build_object('person_id', p.id, 'company_id', p.company_id, 'as_of', p_as_of, 'status', 'REVIEW_REQUIRED',
      'computed_at', now(), 'valid_until', NULL,
      'reasons', jsonb_build_array(jsonb_build_object('code', 'no_role',
                 'text', 'No role assigned — requirements cannot be established')),
      'summary', jsonb_build_object('required', 0, 'met', 0, 'unmet', 0, 'review', 0, 'conditional', 0, 'expiring', 0,
                                    'safety_critical_gap', false),
      'requirements', '[]'::jsonb);
  END IF;

  FOR req IN
    SELECT r.*,
           (r.safety_critical
            OR (r.requirement_type = 'training'      AND EXISTS (SELECT 1 FROM training_courses c WHERE c.id = r.reference_id AND c.safety_critical))
            OR (r.requirement_type = 'competency'    AND EXISTS (SELECT 1 FROM competencies c WHERE c.id = r.reference_id AND c.safety_critical))
            OR (r.requirement_type = 'authorisation' AND EXISTS (SELECT 1 FROM authorisation_types c WHERE c.id = r.reference_id AND c.safety_critical))
            OR (r.requirement_type = 'medical'       AND EXISTS (SELECT 1 FROM occupational_health_requirements c WHERE c.id = r.reference_id AND c.safety_critical))
           ) AS sc_all
      FROM public._wf_requirements(p_person, p_as_of) r
    UNION ALL
    -- Every pre-employment check recorded for the person counts, whether or
    -- not a rule asked for it: a failed or outstanding check is never
    -- ignored (spec 22, 62).
    SELECT 'pre_employment_check', c.check_type_id, NULL, NULL, true, false, false, true, NULL, 0, NULL,
           jsonb_build_array(jsonb_build_object('scope', 'pre_employment', 'scope_id', c.id)), false
      FROM pre_employment_checks c
     WHERE c.person_id = p_person
       AND NOT EXISTS (SELECT 1 FROM public._wf_requirements(p_person, p_as_of) r2
                        WHERE r2.requirement_type = 'pre_employment_check' AND r2.reference_id = c.check_type_id)
  LOOP
    n_req := n_req + 1;
    SELECT * INTO j FROM public._wf_judge(p_person, req.requirement_type, req.reference_id, req.reference_key, req.min_level_id,
                                         req.sc_all, req.evidence_required, req.allow_elearning, req.validity_months,
                                         req.grace_days, p_as_of, soon);
    st := j.status; det := j.detail;
    IF j.status IS NULL THEN
      RAISE EXCEPTION 'Unjudgeable requirement %', req.requirement_type USING ERRCODE = 'XX000';
    END IF;

    -- A live exception, waiver or not-applicable, approved and in date.
    IF st IN ('unmet','review') THEN
      SELECT e.kind, e.valid_until INTO ex FROM requirement_exceptions e
       WHERE e.person_id = p_person AND e.requirement_type = req.requirement_type
         AND ((req.reference_id IS NOT NULL AND e.reference_id = req.reference_id)
              OR (req.reference_key IS NOT NULL AND e.reference_key = req.reference_key))
         AND e.valid_from <= p_as_of AND e.valid_until >= p_as_of
         AND (e.revoked_at IS NULL OR e.revoked_at::date > p_as_of)
       ORDER BY CASE e.kind WHEN 'not_applicable' THEN 0 WHEN 'waiver' THEN 1 ELSE 2 END, e.valid_until DESC LIMIT 1;
      IF FOUND THEN
        det := COALESCE(det, '') || CASE WHEN det IS NULL THEN '' ELSE ' — ' END
               || CASE ex.kind WHEN 'not_applicable' THEN 'marked not applicable'
                               WHEN 'waiver' THEN 'waived' ELSE 'temporary exception' END
               || ' until ' || to_char(ex.valid_until, 'DD Mon YYYY');
        st := CASE WHEN ex.kind = 'not_applicable' THEN 'not_applicable' ELSE 'excepted' END;
        until := LEAST(COALESCE(until, ex.valid_until + 1), ex.valid_until + 1);
      END IF;
    END IF;
    IF j.next_edge IS NOT NULL THEN until := LEAST(COALESCE(until, j.next_edge), j.next_edge); END IF;

    IF req.mandatory THEN
      IF st = 'unmet' THEN
        n_unmet := n_unmet + 1; IF req.sc_all THEN sc_gap := true; END IF;
        reasons := reasons || jsonb_build_object('code', 'unmet', 'type', req.requirement_type, 'name', j.name,
                     'safety_critical', req.sc_all, 'text', j.name || ': ' || COALESCE(det, 'not met'));
      ELSIF st = 'review' THEN
        n_review := n_review + 1;
        reasons := reasons || jsonb_build_object('code', 'review', 'type', req.requirement_type, 'name', j.name,
                     'safety_critical', req.sc_all, 'text', j.name || ': ' || COALESCE(det, 'needs review'));
      ELSIF st IN ('excepted','met_with_restrictions') THEN
        n_cond := n_cond + 1;
        reasons := reasons || jsonb_build_object('code', st, 'type', req.requirement_type, 'name', j.name,
                     'safety_critical', req.sc_all, 'text', j.name || ': ' || COALESCE(det, st));
      ELSIF st IN ('met','expiring','not_applicable') THEN
        n_met := n_met + 1;
      END IF;
      IF st = 'expiring' THEN n_exp := n_exp + 1; END IF;
    ELSIF st = 'expiring' THEN
      n_exp := n_exp + 1;
    END IF;

    items := items || jsonb_build_object(
      'type', req.requirement_type, 'reference_id', req.reference_id, 'reference_key', req.reference_key,
      'name', j.name, 'mandatory', req.mandatory, 'safety_critical', req.sc_all, 'status', st, 'detail', det,
      'evidence_date', j.evidence_date, 'expires_on', j.expires_on, 'required_by', req.required_by,
      'sources', req.sources);
  END LOOP;

  -- Onboarding gates on the person's employment (spec 59).
  FOR gate IN
    SELECT tp.task_title, tp.gate, tp.gate_days, e.start_date
      FROM onboarding_task_progress tp
      JOIN onboarding_instances oi ON oi.id = tp.instance_id
      JOIN employee_records e ON e.id = oi.employee_id
     WHERE e.person_id = p_person AND tp.gate <> 'none'
       AND COALESCE(tp.status, 'pending') NOT IN ('completed','skipped')
       AND COALESCE(oi.status, 'in_progress') <> 'cancelled'
  LOOP
    IF gate.gate IN ('before_start','before_unsupervised')
       OR (gate.gate = 'within_days' AND p_as_of > gate.start_date + gate.gate_days) THEN
      n_unmet := n_unmet + 1;
      reasons := reasons || jsonb_build_object('code', 'unmet', 'type', 'onboarding', 'name', gate.task_title,
                   'safety_critical', false,
                   'text', 'Onboarding: ' || gate.task_title || ' — ' ||
                           CASE gate.gate WHEN 'before_start' THEN 'required before starting'
                                          WHEN 'before_unsupervised' THEN 'required before unsupervised work'
                                          ELSE 'was due within ' || gate.gate_days || ' days of starting' END);
    ELSIF gate.gate = 'within_days' THEN
      until := LEAST(COALESCE(until, gate.start_date + gate.gate_days + 1), gate.start_date + gate.gate_days + 1);
    END IF;
  END LOOP;

  overall := CASE WHEN n_unmet > 0 THEN 'NOT_READY'
                  WHEN n_review > 0 THEN 'REVIEW_REQUIRED'
                  WHEN n_cond > 0 THEN 'CONDITIONALLY_READY'
                  ELSE 'READY' END;

  RETURN jsonb_build_object('person_id', p.id, 'company_id', p.company_id, 'as_of', p_as_of, 'status', overall,
    'computed_at', now(), 'valid_until', until, 'reasons', reasons,
    'summary', jsonb_build_object('required', n_req, 'met', n_met, 'unmet', n_unmet, 'review', n_review,
                                  'conditional', n_cond, 'expiring', n_exp, 'safety_critical_gap', sc_gap),
    'requirements', items);
END $$;

-- Calculation must never fail open (spec 109).
CREATE OR REPLACE FUNCTION public._wf_deployment_safe(p_person uuid, p_as_of date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  RETURN public._wf_deployment(p_person, p_as_of);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('person_id', p_person, 'as_of', p_as_of, 'status', 'REVIEW_REQUIRED', 'computed_at', now(),
    'valid_until', NULL, 'error_class', SQLSTATE,
    'reasons', jsonb_build_array(jsonb_build_object('code', 'calculation_error',
               'text', 'The status could not be calculated — a person must review it')),
    'summary', jsonb_build_object('required', 0, 'met', 0, 'unmet', 0, 'review', 1, 'conditional', 0, 'expiring', 0,
                                  'safety_critical_gap', false),
    'requirements', '[]'::jsonb);
END $$;

REVOKE ALL ON FUNCTION public._wf_soon_days(uuid), public._wf_requirements(uuid, date),
  public._wf_judge(uuid, text, uuid, text, uuid, boolean, boolean, boolean, integer, integer, date, integer),
  public._wf_deployment(uuid, date), public._wf_deployment_safe(uuid, date) FROM PUBLIC, anon, authenticated;

-- ─── 5. Cache, log, invalidation ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.person_deployment_status (
  person_id   uuid PRIMARY KEY REFERENCES public.people(id) ON DELETE CASCADE,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  status      text NOT NULL CHECK (status IN ('READY','CONDITIONALLY_READY','NOT_READY','REVIEW_REQUIRED')),
  result      jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  valid_until date,
  dirty       boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS person_deployment_status_company_idx ON public.person_deployment_status (company_id, status);
CREATE INDEX IF NOT EXISTS person_deployment_status_due_idx ON public.person_deployment_status (valid_until) WHERE NOT dirty;

CREATE TABLE IF NOT EXISTS public.deployment_status_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id   uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  from_status text,
  to_status   text NOT NULL,
  reasons     jsonb NOT NULL DEFAULT '[]'::jsonb,
  changed_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS deployment_status_log_person_idx ON public.deployment_status_log (person_id, changed_at DESC);

ALTER TABLE public.person_deployment_status ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS person_deployment_status_read ON public.person_deployment_status;
CREATE POLICY person_deployment_status_read ON public.person_deployment_status FOR SELECT TO authenticated
  USING (public.person_visible(person_id));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.person_deployment_status FROM anon, authenticated;
ALTER TABLE public.deployment_status_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS deployment_status_log_read ON public.deployment_status_log;
CREATE POLICY deployment_status_log_read ON public.deployment_status_log FOR SELECT TO authenticated
  USING (public.person_visible(person_id));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.deployment_status_log FROM anon, authenticated;

-- Recalculate one person, store it, log a change. Service role and the
-- functions below only.
CREATE OR REPLACE FUNCTION public.workforce_refresh(p_person uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE res jsonb; prev text; org uuid;
BEGIN
  SELECT company_id INTO org FROM people WHERE id = p_person;
  IF org IS NULL THEN RETURN NULL; END IF;
  res := public._wf_deployment_safe(p_person, public.workforce_today());
  SELECT status INTO prev FROM person_deployment_status WHERE person_id = p_person FOR UPDATE;
  INSERT INTO person_deployment_status (person_id, company_id, status, result, computed_at, valid_until, dirty)
    VALUES (p_person, org, res ->> 'status', res, now(), NULLIF(res ->> 'valid_until', '')::date, false)
  ON CONFLICT (person_id) DO UPDATE SET company_id = EXCLUDED.company_id, status = EXCLUDED.status, result = EXCLUDED.result,
    computed_at = EXCLUDED.computed_at, valid_until = EXCLUDED.valid_until, dirty = false;
  IF prev IS DISTINCT FROM res ->> 'status' THEN
    INSERT INTO deployment_status_log (company_id, person_id, from_status, to_status, reasons)
      VALUES (org, p_person, prev, res ->> 'status',
              COALESCE((SELECT jsonb_agg(jsonb_build_object('code', x ->> 'code', 'type', x ->> 'type', 'name', x ->> 'name',
                                                            'safety_critical', x -> 'safety_critical'))
                          FROM jsonb_array_elements(res -> 'reasons') x), '[]'::jsonb));
  END IF;
  RETURN res ->> 'status';
END $$;

-- The cron's sweep: dirty, out-of-date and never-calculated workers.
CREATE OR REPLACE FUNCTION public.workforce_refresh_due(p_limit integer DEFAULT 500)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pid uuid; n integer := 0; today date := public.workforce_today();
BEGIN
  FOR pid IN
    SELECT s.person_id FROM person_deployment_status s
     WHERE s.dirty OR (s.valid_until IS NOT NULL AND s.valid_until <= today) OR s.computed_at::date < today - 7
    UNION
    SELECT a.person_id FROM role_assignments a
     WHERE a.assignment_status <> 'ended'
       AND NOT EXISTS (SELECT 1 FROM person_deployment_status s WHERE s.person_id = a.person_id)
    LIMIT GREATEST(1, LEAST(p_limit, 5000))
  LOOP
    PERFORM public.workforce_refresh(pid);
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.workforce_refresh(uuid), public.workforce_refresh_due(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workforce_refresh(uuid), public.workforce_refresh_due(integer) TO service_role;

-- Mark the people an input change can affect. TG_ARGV[0] says how to find
-- them from the row.
CREATE OR REPLACE FUNCTION public.workforce_mark_dirty()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE mode text := TG_ARGV[0];
  r jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  o jsonb := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
BEGIN
  IF mode = 'person' THEN
    UPDATE person_deployment_status SET dirty = true
     WHERE person_id IN ((r ->> 'person_id')::uuid, (o ->> 'person_id')::uuid) AND NOT dirty;
  ELSIF mode = 'self' THEN
    UPDATE person_deployment_status SET dirty = true WHERE person_id = (r ->> 'id')::uuid AND NOT dirty;
  ELSIF mode = 'role' THEN
    UPDATE person_deployment_status SET dirty = true
     WHERE NOT dirty AND person_id IN (SELECT person_id FROM role_assignments
                                        WHERE role_id IN ((r ->> 'role_id')::uuid, (r ->> 'id')::uuid));
  ELSIF mode = 'site' THEN
    UPDATE person_deployment_status SET dirty = true
     WHERE NOT dirty AND person_id IN (SELECT person_id FROM role_assignments WHERE site_id = (r ->> 'site_id')::uuid);
  ELSIF mode = 'authorisation' THEN
    UPDATE person_deployment_status SET dirty = true
     WHERE NOT dirty AND person_id = (SELECT person_id FROM person_authorisations WHERE id = (r ->> 'authorisation_id')::uuid);
  ELSIF mode = 'onboarding' THEN
    UPDATE person_deployment_status SET dirty = true
     WHERE NOT dirty AND person_id = (SELECT e.person_id FROM onboarding_instances oi JOIN employee_records e ON e.id = oi.employee_id
                                       WHERE oi.id = (r ->> 'instance_id')::uuid);
  ELSIF mode = 'company' THEN
    UPDATE person_deployment_status SET dirty = true
     WHERE NOT dirty AND (company_id = (r ->> 'company_id')::uuid OR (r ->> 'company_id') IS NULL);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.workforce_mark_dirty() FROM PUBLIC, anon, authenticated;

DO $$
DECLARE t text; m text;
BEGIN
  FOR t, m IN VALUES
    ('role_assignments','person'), ('person_requirements','person'), ('training_records','person'),
    ('person_competencies','person'), ('competency_suspensions','person'), ('person_credentials','person'),
    ('induction_completions','person'), ('person_authorisations','person'), ('ppe_issues','person'),
    ('pre_employment_checks','person'), ('requirement_exceptions','person'), ('person_health_outcomes','person'),
    ('employee_documents','person'), ('people','self'),
    ('role_requirements','role'), ('job_roles','role'), ('site_requirements','site'),
    ('authorisation_suspensions','authorisation'), ('onboarding_task_progress','onboarding'),
    ('workforce_settings','company'), ('training_courses','company'), ('competencies','company'),
    ('credential_types','company'), ('induction_templates','company'), ('occupational_health_requirements','company'),
    ('authorisation_types','company'), ('competency_levels','company')
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_wf_dirty ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER %1$s_wf_dirty AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.workforce_mark_dirty(%2$L)', t, m);
  END LOOP;
END $$;

-- ─── 6. The public reads ────────────────────────────────────────────

-- One person, today (cached when clean and in date) or on any past date
-- (always calculated). Refuses anyone who may not see the person.
CREATE OR REPLACE FUNCTION public.person_deployment_status(p_person uuid, p_as_of date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE today date := public.workforce_today(); d date := COALESCE(p_as_of, public.workforce_today()); c person_deployment_status%ROWTYPE;
BEGIN
  IF NOT public.person_visible(p_person) THEN
    RAISE EXCEPTION 'You cannot see this person' USING ERRCODE = '42501';
  END IF;
  IF d = today THEN
    SELECT * INTO c FROM person_deployment_status WHERE person_id = p_person;
    IF FOUND AND NOT c.dirty AND (c.valid_until IS NULL OR c.valid_until > today) AND c.computed_at::date = today THEN
      RETURN c.result || jsonb_build_object('source', 'cache');
    END IF;
  END IF;
  RETURN public._wf_deployment_safe(p_person, d) || jsonb_build_object('source', 'live');
END $$;

-- Everyone in an organisation the caller may see, with their status.
CREATE OR REPLACE FUNCTION public.workforce_readiness(p_company uuid)
RETURNS TABLE (person_id uuid, full_name text, worker_type text, engagement_type text, lifecycle_status text,
               primary_role_id uuid, site_id uuid, department_id uuid, manager_id uuid,
               status text, required integer, unmet integer, review integer, conditional integer, expiring integer,
               safety_critical_gap boolean, computed_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE today date := public.workforce_today(); pr record; res jsonb; c person_deployment_status%ROWTYPE;
BEGIN
  IF p_company IS DISTINCT FROM public.my_company_id() AND NOT public.is_tps_staff() THEN
    RAISE EXCEPTION 'Not your organisation' USING ERRCODE = '42501';
  END IF;
  FOR pr IN
    SELECT p.* FROM people p
     WHERE p.company_id = p_company
       AND p.worker_type IN ('employee','contractor','consultant','temporary_worker')
       AND p.lifecycle_status IN ('pre_employment','active','notice','leave_of_absence')
       AND public.person_visible(p.id)
     ORDER BY p.full_name
  LOOP
    SELECT * INTO c FROM person_deployment_status s WHERE s.person_id = pr.id;
    IF FOUND AND NOT c.dirty AND (c.valid_until IS NULL OR c.valid_until > today) AND c.computed_at::date = today THEN
      res := c.result;
    ELSE
      res := public._wf_deployment_safe(pr.id, today);
    END IF;
    person_id := pr.id; full_name := pr.full_name; worker_type := pr.worker_type; engagement_type := pr.engagement_type;
    lifecycle_status := pr.lifecycle_status; primary_role_id := pr.primary_role_id; site_id := pr.site_id;
    department_id := pr.department_id; manager_id := pr.manager_id;
    status := res ->> 'status';
    required := (res -> 'summary' ->> 'required')::int; unmet := (res -> 'summary' ->> 'unmet')::int;
    review := (res -> 'summary' ->> 'review')::int; conditional := (res -> 'summary' ->> 'conditional')::int;
    expiring := (res -> 'summary' ->> 'expiring')::int;
    safety_critical_gap := (res -> 'summary' ->> 'safety_critical_gap')::boolean;
    computed_at := (res ->> 'computed_at')::timestamptz;
    RETURN NEXT;
  END LOOP;
END $$;

-- "What would changing this person's role introduce?" (spec 87)
CREATE OR REPLACE FUNCTION public.role_change_preview(p_person uuid, p_role uuid)
RETURNS TABLE (requirement_type text, reference_id uuid, reference_key text, name text, mandatory boolean,
               safety_critical boolean, already_required boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT r.requirement_type, r.reference_id, r.reference_key,
         COALESCE(tc.title, co.title, ct.title, it.title, oh.title, at.title, pt.title, pc.title, initcap(replace(r.reference_key, '_', ' '))),
         r.mandatory, r.safety_critical,
         EXISTS (SELECT 1 FROM public._wf_requirements(p_person, public.workforce_today()) x
                  WHERE x.requirement_type = r.requirement_type
                    AND x.reference_id IS NOT DISTINCT FROM r.reference_id AND x.reference_key IS NOT DISTINCT FROM r.reference_key)
    FROM role_requirements r
    LEFT JOIN training_courses tc ON r.requirement_type = 'training' AND tc.id = r.reference_id
    LEFT JOIN competencies co ON r.requirement_type = 'competency' AND co.id = r.reference_id
    LEFT JOIN credential_types ct ON r.requirement_type IN ('qualification','certification','licence','card','permit') AND ct.id = r.reference_id
    LEFT JOIN induction_templates it ON r.requirement_type = 'induction' AND it.id = r.reference_id
    LEFT JOIN occupational_health_requirements oh ON r.requirement_type = 'medical' AND oh.id = r.reference_id
    LEFT JOIN authorisation_types at ON r.requirement_type = 'authorisation' AND at.id = r.reference_id
    LEFT JOIN ppe_types pt ON r.requirement_type = 'ppe' AND pt.id = r.reference_id
    LEFT JOIN pre_employment_check_types pc ON r.requirement_type = 'pre_employment_check' AND pc.id = r.reference_id
   WHERE r.role_id = p_role AND public.person_visible(p_person)
     AND (SELECT company_id FROM job_roles WHERE id = p_role) = (SELECT company_id FROM people WHERE id = p_person)
     AND r.effective_from IS NOT NULL AND r.effective_from <= public.workforce_today()
     AND (r.effective_until IS NULL OR r.effective_until >= public.workforce_today())
$$;

REVOKE ALL ON FUNCTION public.person_deployment_status(uuid, date), public.workforce_readiness(uuid),
  public.role_change_preview(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_deployment_status(uuid, date), public.workforce_readiness(uuid),
  public.role_change_preview(uuid, uuid) TO authenticated, service_role;
