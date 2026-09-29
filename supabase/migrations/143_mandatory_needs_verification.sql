-- ═══════════════════════════════════════════════════════════════════
-- 143: mandatory items always need verified evidence (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- QA 42 Medium 2, closed by product decision (Tom): a self-submitted,
-- unverified training record or credential could satisfy a mandatory
-- requirement that was neither safety-critical nor marked
-- evidence-required, with an expiry the worker chose themselves.
--
-- _wf_judge gains p_mandatory (default false, so any caller that has not
-- been updated keeps the old behaviour rather than erroring); the one
-- real caller (136's _wf_deployment) now passes req.mandatory. This
-- makes need_verified true for every mandatory item, not only
-- safety-critical or evidence-required ones — a worker's own unverified
-- submission never counts as met for anything mandatory. An optional
-- (non-mandatory) requirement is unaffected: self-submitted evidence
-- still counts, exactly as the plan allowed.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._wf_judge(
  p_person uuid, p_type text, p_ref uuid, p_key text, p_min_level uuid,
  p_sc boolean, p_evidence boolean, p_elearning boolean, p_validity integer, p_grace integer,
  p_as_of date, p_soon integer, p_mandatory boolean DEFAULT false,
  OUT status text, OUT name text, OUT detail text, OUT evidence_date date, OUT expires_on date, OUT next_edge date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  -- 143: a mandatory item always needs verified evidence (Tom's decision on QA 42 M2 —
  -- self-submitted evidence never certifies a mandatory requirement by itself).
  need_verified boolean := COALESCE(p_evidence, false) OR COALESCE(p_sc, false) OR COALESCE(p_mandatory, false);
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
REVOKE ALL ON FUNCTION public._wf_soon_days(uuid), public._wf_requirements(uuid, date),
  public._wf_judge(uuid, text, uuid, text, uuid, boolean, boolean, boolean, integer, integer, date, integer, boolean),
  public._wf_deployment(uuid, date), public._wf_deployment_safe(uuid, date) FROM PUBLIC, anon, authenticated;

-- The one real caller now passes mandatory too.
-- (136's _wf_deployment, unchanged except the judge call now passes req.mandatory.)
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
                                         req.grace_days, p_as_of, soon, req.mandatory);
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

UPDATE public.person_deployment_status SET dirty = true WHERE NOT dirty;
