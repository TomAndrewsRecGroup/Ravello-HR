-- Core-OS 360 Phase 3 QA probe, part 2 (2026-09-28). Rolled back.
-- QA 2 (one person from athlete → candidate → employee), 4 (assignments
-- combine: primary + temporary + site), 5 (a role with 2 training, 2
-- competencies, 1 qualification, 1 medical, 1 induction shows all 7),
-- 7 (training: recorded → verified → expired → renewed, history kept),
-- 12 (qualification: submitted → rejected → verified → expired →
-- renewed), 13 (site induction and re-induction). Fixtures as the owner;
-- the engine read directly so a defect is an error, not a hidden
-- REVIEW_REQUIRED.
-- Recorded 2026-09-28. Run 1: 5 PASS / 1 FAIL — QA2: a hired athlete
-- stayed worker_type 'athlete', so they never appeared on the Safe to
-- Deploy lists (HIGH; fixed by 141). After 141 the QA2 block re-run as
-- staff: one person, 'employee', 'active', and on workforce_matrix (1).
-- QA 4, 5, 7, 12, 13 passed on run 1 and are untouched by 141.

DO $$
DECLARE r text := ''; s text; res jsonb; t date := public.workforce_today(); a uuid := gen_random_uuid();
  ath uuid; cand_p uuid; emp_p uuid; reqn uuid; cand uuid; er uuid;
  w uuid; r1 uuid; r2 uuid; site uuid; c1 uuid; c2 uuid; c3 uuid; k1 uuid; k2 uuid; lvl uuid; q uuid; oh uuid; ind uuid;
  tr1 uuid; cr1 uuid;
BEGIN
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES (a, 'PQ2 A', 'pq2a-' || left(a::text, 8), 'direct_client', true);

  -- ── QA 2: athlete → candidate → employee is ONE person ──
  INSERT INTO athletes (company_id, full_name, email) VALUES (a, 'PQ2 Ath Lete', 'pq2-ath@probe.invalid');
  SELECT person_id INTO ath FROM athletes WHERE company_id = a AND email = 'pq2-ath@probe.invalid';
  INSERT INTO requisitions (company_id, title) VALUES (a, 'PQ2 Role') RETURNING id INTO reqn;
  INSERT INTO candidates (requisition_id, company_id, full_name, email) VALUES (reqn, a, 'PQ2 Ath Lete', 'PQ2-ATH@probe.invalid')
    RETURNING id, person_id INTO cand, cand_p;
  INSERT INTO employee_records (company_id, full_name, job_title, start_date, source_candidate_id, status)
    VALUES (a, 'PQ2 Ath Lete', 'Operative', t, cand, 'active') RETURNING id, person_id INTO er, emp_p;
  SELECT (ath = cand_p AND cand_p = emp_p)::text || '/' || worker_type || '/' || lifecycle_status || '/' ||
         (SELECT count(*) FROM people WHERE company_id = a) INTO s FROM people WHERE id = emp_p;
  r := r || CASE WHEN s = 'true/employee/active/1' THEN 'PASS' ELSE 'FAIL' END
          || ' QA2 athlete → candidate (email any case) → employee is one person, now an active employee (' || s || '); ';

  -- ── QA 5: a role with 2 training, 2 competencies, 1 qualification, 1 medical, 1 induction ──
  INSERT INTO people (company_id, full_name, worker_type, lifecycle_status) VALUES (a, 'PQ2 Worker', 'employee', 'active') RETURNING id INTO w;
  INSERT INTO job_roles (company_id, title) VALUES (a, 'PQ2 Fitter') RETURNING id INTO r1;
  INSERT INTO job_roles (company_id, title) VALUES (a, 'PQ2 Cover driver') RETURNING id INTO r2;
  INSERT INTO hs_sites (company_id, name) VALUES (a, 'PQ2 Plant') RETURNING id INTO site;
  INSERT INTO training_courses (company_id, title, validity_months) VALUES (a, 'PQ2 Abrasive wheels', 36) RETURNING id INTO c1;
  INSERT INTO training_courses (company_id, title, validity_months) VALUES (a, 'PQ2 LOTO', 12) RETURNING id INTO c2;
  INSERT INTO training_courses (company_id, title, validity_months) VALUES (a, 'PQ2 Defensive driving', 24) RETURNING id INTO c3;
  INSERT INTO competencies (company_id, title) VALUES (a, 'PQ2 Pump alignment') RETURNING id INTO k1;
  INSERT INTO competencies (company_id, title) VALUES (a, 'PQ2 Pipefitting') RETURNING id INTO k2;
  INSERT INTO credential_types (company_id, kind, title, validity_months) VALUES (a, 'qualification', 'PQ2 NVQ L3', NULL) RETURNING id INTO q;
  INSERT INTO occupational_health_requirements (company_id, title, category, frequency_months) VALUES (a, 'PQ2 Hearing test', 'audiometry', 12) RETURNING id INTO oh;
  INSERT INTO induction_templates (company_id, title, scope, reinduction_months) VALUES (a, 'PQ2 Plant induction', 'site', 12) RETURNING id INTO ind;
  SELECT id INTO lvl FROM competency_levels WHERE company_id IS NULL AND key = 'competent';
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, min_level_id, effective_from) VALUES
    (a, r1, 'training', c1, NULL, current_date), (a, r1, 'training', c2, NULL, current_date),
    (a, r1, 'competency', k1, lvl, current_date), (a, r1, 'competency', k2, lvl, current_date),
    (a, r1, 'qualification', q, NULL, current_date), (a, r1, 'medical', oh, NULL, current_date);
  INSERT INTO site_requirements (company_id, site_id, requirement_type, reference_id, effective_from) VALUES (a, site, 'induction', ind, current_date);
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, effective_from) VALUES (a, r2, 'training', c3, current_date);
  INSERT INTO role_assignments (company_id, person_id, role_id, site_id, primary_assignment, start_date) VALUES (a, w, r1, site, true, t);
  res := public._wf_deployment(w, t);
  SELECT string_agg(x ->> 'type', ',' ORDER BY x ->> 'type') INTO s FROM jsonb_array_elements(res -> 'requirements') x;
  r := r || CASE WHEN s = 'competency,competency,induction,medical,qualification,training,training' THEN 'PASS' ELSE 'FAIL' END
          || ' QA5 all seven of the role and site''s requirements appear (' || s || '); ';

  -- ── QA 4: a temporary second assignment adds its rules only while it lasts ──
  INSERT INTO role_assignments (company_id, person_id, role_id, start_date, end_date) VALUES (a, w, r2, t, t + 10);
  s := jsonb_array_length(public._wf_deployment(w, t) -> 'requirements') || '/' || jsonb_array_length(public._wf_deployment(w, t + 11) -> 'requirements');
  r := r || CASE WHEN s = '8/7' THEN 'PASS' ELSE 'FAIL' END || ' QA4 primary + temporary + site combine (8), and the temporary role drops off after it ends (7) (' || s || '); ';

  -- ── QA 7: training life (rules start today, so the history is walked forwards) ──
  INSERT INTO training_records (company_id, person_id, course_id, course_name, completed_on, result, source)
    VALUES (a, w, c2, 'PQ2 LOTO', t - 10, 'pass', 'manual') RETURNING id INTO tr1;
  SELECT x ->> 'status' INTO s FROM jsonb_array_elements(public._wf_deployment(w, t) -> 'requirements') x WHERE x ->> 'name' = 'PQ2 LOTO';
  UPDATE training_records SET verification_status = 'verified', verified_at = now() WHERE id = tr1;
  SELECT s || '→' || (x ->> 'status') INTO s FROM jsonb_array_elements(public._wf_deployment(w, t) -> 'requirements') x WHERE x ->> 'name' = 'PQ2 LOTO';
  SELECT s || '→' || (x ->> 'status') INTO s FROM jsonb_array_elements(public._wf_deployment(w, t + 400) -> 'requirements') x WHERE x ->> 'name' = 'PQ2 LOTO';
  INSERT INTO training_records (company_id, person_id, course_id, course_name, completed_on, expires_on, result, verification_status, verified_at)
    VALUES (a, w, c2, 'PQ2 LOTO', t, t + 800, 'pass', 'verified', now());
  SELECT s || '→' || (x ->> 'status') || '/' || (SELECT count(*) FROM training_records WHERE person_id = w AND course_id = c2)
    INTO s FROM jsonb_array_elements(public._wf_deployment(w, t + 400) -> 'requirements') x WHERE x ->> 'name' = 'PQ2 LOTO';
  r := r || CASE WHEN s = 'met→met→unmet→met/2' THEN 'PASS' ELSE 'FAIL' END
          || ' QA7 training recorded (not safety-critical: counts unverified) → verified → expired after 12 months → renewed; both records kept (' || s || '); ';

  -- ── QA 12: qualification life (not safety-critical, no evidence rule: unverified counts, rejected never) ──
  INSERT INTO person_credentials (company_id, person_id, credential_type_id, issued_on, expires_on, verification_status)
    VALUES (a, w, q, t - 30, t + 5, 'unverified') RETURNING id INTO cr1;
  SELECT x ->> 'status' INTO s FROM jsonb_array_elements(public._wf_deployment(w, t) -> 'requirements') x WHERE x ->> 'type' = 'qualification';
  UPDATE person_credentials SET verification_status = 'rejected', rejection_reason = 'Illegible' WHERE id = cr1;
  SELECT s || '→' || (x ->> 'status') INTO s FROM jsonb_array_elements(public._wf_deployment(w, t) -> 'requirements') x WHERE x ->> 'type' = 'qualification';
  INSERT INTO person_credentials (company_id, person_id, credential_type_id, issued_on, expires_on, verification_status, verified_at)
    VALUES (a, w, q, t - 30, t + 5, 'verified', now());
  SELECT s || '→' || (x ->> 'status') INTO s FROM jsonb_array_elements(public._wf_deployment(w, t) -> 'requirements') x WHERE x ->> 'type' = 'qualification';
  SELECT s || '→' || (x ->> 'status') INTO s FROM jsonb_array_elements(public._wf_deployment(w, t + 6) -> 'requirements') x WHERE x ->> 'type' = 'qualification';
  INSERT INTO person_credentials (company_id, person_id, credential_type_id, issued_on, expires_on, verification_status, verified_at)
    VALUES (a, w, q, t, t + 1000, 'verified', now());
  SELECT s || '→' || (x ->> 'status') INTO s FROM jsonb_array_elements(public._wf_deployment(w, t + 6) -> 'requirements') x WHERE x ->> 'type' = 'qualification';
  r := r || CASE WHEN s = 'expiring→unmet→expiring→unmet→met' THEN 'PASS' ELSE 'FAIL' END
          || ' QA12 qualification submitted (counts, expiring soon) → rejected (never counts) → verified → expired → renewed (' || s || '); ';

  -- ── QA 13: site induction and re-induction ──
  SELECT x ->> 'status' INTO s FROM jsonb_array_elements(public._wf_deployment(w, t) -> 'requirements') x WHERE x ->> 'type' = 'induction';
  INSERT INTO induction_completions (company_id, person_id, induction_template_id, completed_on, reinduction_due) VALUES (a, w, ind, t - 360, t + 5);
  SELECT s || '→' || (x ->> 'status') INTO s FROM jsonb_array_elements(public._wf_deployment(w, t) -> 'requirements') x WHERE x ->> 'type' = 'induction';
  SELECT s || '→' || (x ->> 'status') INTO s FROM jsonb_array_elements(public._wf_deployment(w, t + 6) -> 'requirements') x WHERE x ->> 'type' = 'induction';
  INSERT INTO induction_completions (company_id, person_id, induction_template_id, completed_on) VALUES (a, w, ind, t);
  SELECT s || '→' || (x ->> 'status') INTO s FROM jsonb_array_elements(public._wf_deployment(w, t + 6) -> 'requirements') x WHERE x ->> 'type' = 'induction';
  r := r || CASE WHEN s = 'unmet→expiring→unmet→met' THEN 'PASS' ELSE 'FAIL' END
          || ' QA13 site induction: missing → done, re-induction due → overdue → re-inducted (12-month cycle) (' || s || '); ';

  RAISE EXCEPTION 'PROBE PHASE3 QA2: % PASS / % FAIL :: %', (length(r)-length(replace(r,'PASS','')))/4, (length(r)-length(replace(r,'FAIL','')))/4, r;
END $$;
