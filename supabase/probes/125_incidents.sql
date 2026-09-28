-- 125 live probe (2026-09-26): incidents, investigations, corrective-
-- action verification and RIDDOR, run as real users in ONE transaction
-- that always rolls back. Fixture tenancy only (Probe X / Probe Y /
-- Probe Home); nothing here is ever committed.
--
-- Roles in Probe X:
--   emp, emp2  client_user            → employee        (incident.create only)
--   adm, adm2  client_admin           → organisation_admin (everything)
--   site       grant site_manager     (investigate, no approve, no RIDDOR)
--   adv        grant hse_advisor      (investigate, no approve, no RIDDOR)
--   hsem       grant hse_manager      (approve + riddor.review)
--   yadm       client_admin of Probe Y (another tenant)
-- Expected: every line reads PASS.
--
-- Recorded 2026-09-26:
--   Run 1 stopped at the first RIDDOR review insert: hs_riddor_after
--   wrote riddor_reportable = (decision = 'reportable'), NULL while no
--   decision exists, into a NOT NULL column. Fixed (COALESCE) and
--   re-applied as 125d.
--   Run 2: 75 PASS, 1 FAIL — "unrelated employee cannot submit someone
--   else's action for verification (awaiting_verification)". Phase 1's
--   client_actions_update let any org user update any action. The
--   verification gate still held (only verifier / assigner / staff can
--   verify) but who-did-the-work was forgeable. Fixed by 126 (assigner,
--   assignee or named verifier only, each confined to their own
--   columns). The line after it then read "PASS" only because the
--   probe's own reset statement errored; relabelled.
--   Audit actions seen: action.completed, created, effectiveness_reviewed,
--   updated, verification_rejected, verified; incident.archived, closed,
--   reopened, reported, severity_confirmed, status_changed, triaged,
--   updated; investigation.completed, started, submitted; riddor.reviewed.
--   Description text ("SECRETMEDICAL") found in 0 timeline, 0 audit and
--   0 outbox rows.

DO $$
DECLARE
  r text := ''; n int; st text; e text; ok boolean;
  x uuid := gen_random_uuid(); y uuid := gen_random_uuid(); h uuid := gen_random_uuid();
  emp uuid := gen_random_uuid(); emp2 uuid := gen_random_uuid(); adm uuid := gen_random_uuid(); adm2 uuid := gen_random_uuid();
  site uuid := gen_random_uuid(); adv uuid := gen_random_uuid(); hsem uuid := gen_random_uuid(); yadm uuid := gen_random_uuid();
  staff uuid := '7434b282-0b17-4e6f-9fe1-65fb383fb8a5';
  inc uuid; inc2 uuid; ip uuid; inv uuid; cause uuid; act uuid; act2 uuid; rr uuid; rr2 uuid;
BEGIN
  -- ── fixtures (as the migration owner) ──────────────────────────────
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES
    (x, 'Probe X Manufacturing', 'probe-x-'||left(x::text,8), 'direct_client', true),
    (y, 'Probe Y Construction',  'probe-y-'||left(y::text,8), 'direct_client', true),
    (h, 'Probe Home',            'probe-h-'||left(h::text,8), 'direct_client', true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data)
  SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', em, '', now(), now(), now(), '{}', '{}'
    FROM (VALUES (emp,'p125-emp@probe.invalid'), (emp2,'p125-emp2@probe.invalid'), (adm,'p125-adm@probe.invalid'),
                 (adm2,'p125-adm2@probe.invalid'), (site,'p125-site@probe.invalid'), (adv,'p125-adv@probe.invalid'),
                 (hsem,'p125-hsem@probe.invalid'), (yadm,'p125-yadm@probe.invalid')) AS v(id, em);
  UPDATE profiles SET role = 'client_user',  company_id = x WHERE id IN (emp, emp2);
  UPDATE profiles SET role = 'client_admin', company_id = x WHERE id IN (adm, adm2);
  UPDATE profiles SET role = 'client_user',  company_id = h WHERE id IN (site, adv, hsem);
  UPDATE profiles SET role = 'client_admin', company_id = y WHERE id = yadm;
  INSERT INTO user_organisation_access (user_id, organisation_id, role_key) VALUES
    (site, x, 'site_manager'), (adv, x, 'hse_advisor'), (hsem, x, 'hse_manager');
  INSERT INTO user_active_organisation (user_id, organisation_id) VALUES (site, x), (adv, x), (hsem, x);
  r := r || 'fixtures ok; ';

  -- ── 1. an employee reports ─────────────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO hs_incidents (company_id, incident_type, title, occurred_on, description, exact_location, severity,
                            riddor_reportable, riddor_review_status, status, incident_number)
  VALUES (x, 'injury', 'Hand caught in press', current_date, 'SECRETMEDICAL crushed finger, taken to A&E', 'Press shop bay 2', 'major',
          true, 'confirmed_not_reportable', 'closed', 'FORGED-1')
  RETURNING id INTO inc;
  SELECT status || '/' || riddor_review_status || '/' || riddor_reportable || '/' || (incident_number LIKE 'INC-%')
         || '/' || (severity_confirmed_at IS NULL) || '/' || (reported_by = emp)
    INTO st FROM hs_incidents WHERE id = inc;
  r := r || CASE WHEN st = 'reported/review_required/false/true/true/true' THEN 'PASS' ELSE 'FAIL' END
         || ' employee report forced to reported, RIDDOR prompt, own number, severity unconfirmed ('||st||'); ';
  BEGIN
    INSERT INTO hs_incidents (company_id, incident_type, title, occurred_on, description, exact_location, injured_person_name)
    VALUES (x, 'injury', 't', current_date, 'd', 'l', 'Joe Bloggs');
    r := r || 'FAIL legacy injured_person_name accepted; ';
  EXCEPTION WHEN others THEN r := r || 'PASS legacy injured_person_name refused; '; END;
  BEGIN
    INSERT INTO hs_incidents (company_id, incident_type, title, occurred_on, description) VALUES (x, 'injury', 't', current_date, 'd');
    r := r || 'FAIL incident with no site or location accepted; ';
  EXCEPTION WHEN others THEN r := r || 'PASS site or exact location required; '; END;
  INSERT INTO incident_people (company_id, incident_id, external_name, role_in_incident) VALUES (x, inc, 'Probe Injured', 'injured_person')
    RETURNING id INTO ip;
  INSERT INTO incident_person_sensitive (incident_person_id, company_id, body_parts, injury_types, treatment)
    VALUES (ip, x, ARRAY['finger'], ARRAY['crush'], 'hospital');
  SELECT count(*) INTO n FROM incident_person_sensitive WHERE incident_person_id = ip;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' reporter recorded injury detail but cannot read it back ('||n||'); ';
  SELECT count(*) INTO n FROM hs_incidents WHERE id = inc;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' reporter sees own report ('||n||'); ';
  UPDATE hs_incidents SET status = 'triage', severity = 'minor' WHERE id = inc;
  SELECT status || '/' || severity INTO st FROM hs_incidents WHERE id = inc;
  r := r || CASE WHEN st = 'reported/major' THEN 'PASS' ELSE 'FAIL' END || ' employee cannot triage or change severity ('||st||'); ';
  BEGIN
    INSERT INTO riddor_reviews (company_id, incident_id, decision, rationale) VALUES (x, inc, 'not_reportable', 'employee says no');
    r := r || 'FAIL employee recorded a RIDDOR decision; ';
  EXCEPTION WHEN others THEN r := r || 'PASS employee cannot record a RIDDOR decision; '; END;
  BEGIN DELETE FROM hs_incidents WHERE id = inc; GET DIAGNOSTICS n = ROW_COUNT;
    r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' employee delete removes nothing ('||n||'); ';
  EXCEPTION WHEN others THEN r := r || 'PASS employee delete refused; '; END;
  RESET ROLE;

  -- ── 2. other employee, other tenant ────────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp2, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM hs_incidents WHERE id = inc;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' another employee cannot see the report ('||n||'); ';
  SELECT count(*) INTO n FROM incident_people WHERE incident_id = inc;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' another employee cannot see the people ('||n||'); ';
  BEGIN INSERT INTO incident_people (company_id, incident_id, external_name, role_in_incident) VALUES (x, inc, 'x', 'witness');
    r := r || 'FAIL non-reporter employee added a person; ';
  EXCEPTION WHEN others THEN r := r || 'PASS non-reporter employee cannot add people; '; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', yadm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM hs_incidents WHERE company_id = x;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' Probe Y admin sees no Probe X incidents ('||n||'); ';
  SELECT count(*) INTO n FROM incident_person_sensitive WHERE company_id = x;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' Probe Y admin sees no Probe X injury detail ('||n||'); ';
  BEGIN INSERT INTO incident_people (company_id, incident_id, external_name, role_in_incident) VALUES (y, inc, 'x', 'witness');
    r := r || 'FAIL cross-tenant person added; ';
  EXCEPTION WHEN others THEN r := r || 'PASS cross-tenant person refused; '; END;
  BEGIN INSERT INTO incident_investigations (company_id, incident_id) VALUES (y, inc);
    r := r || 'FAIL cross-tenant investigation opened; ';
  EXCEPTION WHEN others THEN r := r || 'PASS cross-tenant investigation refused; '; END;
  BEGIN INSERT INTO riddor_reviews (company_id, incident_id) VALUES (y, inc);
    r := r || 'FAIL cross-tenant RIDDOR review; ';
  EXCEPTION WHEN others THEN r := r || 'PASS cross-tenant RIDDOR review refused; '; END;
  BEGIN INSERT INTO actions (company_id, action_type, title, priority, status, source_type, source_id) VALUES (y, 'hs_corrective', 'x', 'normal', 'active', 'incident', inc);
    r := r || 'FAIL action sourced from another tenant''s incident; ';
  EXCEPTION WHEN others THEN r := r || 'PASS action cannot cite another tenant''s incident; '; END;
  UPDATE hs_incidents SET title = 'hijack' WHERE id = inc; GET DIAGNOSTICS n = ROW_COUNT;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' Probe Y cannot edit Probe X incident ('||n||'); ';
  RESET ROLE;

  -- ── 3. site manager triages; RIDDOR flags but no decision ──────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', site, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  r := r || CASE WHEN my_company_id() = x THEN 'PASS' ELSE 'FAIL' END || ' site manager working in Probe X; ';
  UPDATE hs_incidents SET status = 'triage' WHERE id = inc;
  UPDATE hs_incidents SET severity = 'major' WHERE id = inc;  -- unchanged value: no confirmation
  SELECT (severity_confirmed_at IS NULL)::text INTO st FROM hs_incidents WHERE id = inc;
  r := r || CASE WHEN st = 'true' THEN 'PASS' ELSE 'FAIL' END || ' re-saving the reporter''s severity is not a confirmation; ';
  UPDATE hs_incidents SET severity = 'serious' WHERE id = inc;
  UPDATE hs_incidents SET severity = 'major' WHERE id = inc;
  SELECT status || '/' || (triaged_by = site) || '/' || (severity_confirmed_by = site) INTO st FROM hs_incidents WHERE id = inc;
  r := r || CASE WHEN st = 'triage/true/true' THEN 'PASS' ELSE 'FAIL' END || ' site manager triaged + confirmed severity, stamped ('||st||'); ';
  SELECT count(*) INTO n FROM incident_person_sensitive WHERE incident_person_id = ip;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' site manager (no sensitive.read) cannot read injury detail ('||n||'); ';
  BEGIN UPDATE hs_incidents SET status = 'closed', close_override_reason = 'site manager closing it' WHERE id = inc;
    r := r || 'FAIL site manager closed an incident; ';
  EXCEPTION WHEN others THEN r := r || 'PASS site manager cannot close; '; END;
  BEGIN INSERT INTO riddor_reviews (company_id, incident_id, specified_injury, decision, rationale) VALUES (x, inc, true, 'not_reportable', 'manager view');
    r := r || 'FAIL site manager recorded a RIDDOR decision; ';
  EXCEPTION WHEN others THEN r := r || 'PASS site manager cannot record a RIDDOR decision; '; END;
  INSERT INTO riddor_reviews (company_id, incident_id, specified_injury) VALUES (x, inc, true) RETURNING id INTO rr;
  SELECT r2.status || '/' || i.riddor_review_status || '/' || i.riddor_reportable INTO st
    FROM riddor_reviews r2 JOIN hs_incidents i ON i.id = r2.incident_id WHERE r2.id = rr;
  r := r || CASE WHEN st = 'potentially_reportable/potentially_reportable/false' THEN 'PASS' ELSE 'FAIL' END
         || ' decision support flags, never decides ('||st||'); ';
  BEGIN UPDATE hs_incidents SET riddor_review_status = 'confirmed_not_reportable', riddor_reportable = false WHERE id = inc;
    SELECT riddor_review_status INTO st FROM hs_incidents WHERE id = inc;
    r := r || CASE WHEN st = 'potentially_reportable' THEN 'PASS' ELSE 'FAIL' END || ' RIDDOR fields on the incident cannot be set directly ('||st||'); ';
  EXCEPTION WHEN others THEN r := r || 'PASS RIDDOR fields on the incident refused; '; END;

  -- ── 4. investigation ──────────────────────────────────────────────
  INSERT INTO incident_investigations (company_id, incident_id, status, approved_by, approved_at, reference)
    VALUES (x, inc, 'approved', site, now(), 'FORGED') RETURNING id INTO inv;
  SELECT v.status || '/' || (v.reference LIKE 'INV-%') || '/' || (v.lead_investigator_id = site) || '/' || i.status
    INTO st FROM incident_investigations v JOIN hs_incidents i ON i.id = v.incident_id WHERE v.id = inv;
  r := r || CASE WHEN st = 'in_progress/true/true/under_investigation' THEN 'PASS' ELSE 'FAIL' END
         || ' investigation opens in progress, own ref, incident under investigation ('||st||'); ';
  INSERT INTO investigation_why_analyses (company_id, investigation_id, problem, whys)
    VALUES (x, inv, 'Guard was open', ARRAY['Interlock bypassed','Bypass fitted to speed changeover','No changeover time allowed']);
  r := r || 'PASS 5 Whys accepts 3 whys; ';
  BEGIN INSERT INTO investigation_why_analyses (company_id, investigation_id, problem, whys) VALUES (x, inv, 'p', ARRAY[]::text[]);
    r := r || 'FAIL zero whys accepted; ';
  EXCEPTION WHEN others THEN r := r || 'PASS zero whys refused; '; END;
  BEGIN INSERT INTO investigation_why_analyses (company_id, investigation_id, problem, whys) VALUES (x, inv, 'p', array_fill('w'::text, ARRAY[11]));
    r := r || 'FAIL eleven whys accepted; ';
  EXCEPTION WHEN others THEN r := r || 'PASS eleven whys refused; '; END;
  UPDATE incident_investigations SET summary = 'Interlock bypass during changeover.' WHERE id = inv;
  BEGIN UPDATE incident_investigations SET status = 'pending_approval' WHERE id = inv;
    r := r || 'FAIL submitted without a root cause; ';
  EXCEPTION WHEN others THEN r := r || 'PASS submit needs a confirmed root cause; '; END;
  INSERT INTO incident_causes (company_id, investigation_id, cause_level, category, description, confirmed_by, confirmed_at)
    VALUES (x, inv, 'root', 'management', 'Production targets allowed no changeover time', adm, now() - interval '9 days') RETURNING id INTO cause;
  SELECT (confirmed_by = site)::text || '/' || (confirmed_at > now() - interval '1 minute') INTO st FROM incident_causes WHERE id = cause;
  r := r || CASE WHEN st = 'true/true' THEN 'PASS' ELSE 'FAIL' END || ' root cause confirmation stamped to the signed-in person, not a forged one ('||st||'); ';
  UPDATE incident_investigations SET lead_investigator_id = adm WHERE id = inv;
  UPDATE incident_investigations SET status = 'pending_approval' WHERE id = inv;
  BEGIN UPDATE incident_investigations SET findings = 'edited under review' WHERE id = inv;
    r := r || 'FAIL investigation edited while pending approval; ';
  EXCEPTION WHEN others THEN r := r || 'PASS pending investigation is locked; '; END;
  BEGIN INSERT INTO incident_causes (company_id, investigation_id, cause_level, category, description) VALUES (x, inv, 'immediate', 'people', 'x');
    r := r || 'FAIL cause added while pending approval; ';
  EXCEPTION WHEN others THEN r := r || 'PASS causes locked while pending; '; END;
  BEGIN UPDATE incident_investigations SET status = 'approved' WHERE id = inv;
    r := r || 'FAIL site manager approved an investigation; ';
  EXCEPTION WHEN others THEN r := r || 'PASS site manager cannot approve; '; END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN UPDATE incident_investigations SET status = 'approved' WHERE id = inv;
    r := r || 'FAIL lead investigator approved own investigation; ';
  EXCEPTION WHEN others THEN r := r || 'PASS lead investigator cannot approve own investigation; '; END;
  SELECT count(*) INTO n FROM incident_person_sensitive WHERE incident_person_id = ip;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' org admin (sensitive.read) reads injury detail ('||n||'); ';
  BEGIN UPDATE riddor_reviews SET decision = 'reportable' WHERE id = rr;
    r := r || 'FAIL RIDDOR decision without rationale; ';
  EXCEPTION WHEN others THEN r := r || 'PASS RIDDOR decision needs a rationale; '; END;
  UPDATE riddor_reviews SET decision = 'reportable', rationale = 'Crush injury to finger with hospital treatment: specified injury.', decision_by = emp WHERE id = rr;
  SELECT r2.status || '/' || (r2.decision_by = adm) || '/' || i.riddor_review_status || '/' || i.riddor_reportable INTO st
    FROM riddor_reviews r2 JOIN hs_incidents i ON i.id = r2.incident_id WHERE r2.id = rr;
  r := r || CASE WHEN st = 'confirmed_reportable/true/confirmed_reportable/true' THEN 'PASS' ELSE 'FAIL' END
         || ' org admin decides reportable, stamped to self, incident synced ('||st||'); ';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', adv, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN UPDATE riddor_reviews SET decision = 'not_reportable', rationale = 'adviser overrides' WHERE id = rr;
    r := r || 'FAIL HSE adviser changed a RIDDOR decision; ';
  EXCEPTION WHEN others THEN r := r || 'PASS HSE adviser cannot record a RIDDOR decision; '; END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm2, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE incident_investigations SET status = 'approved' WHERE id = inv;
  SELECT v.status || '/' || (v.approved_by = adm2) || '/' || i.status INTO st
    FROM incident_investigations v JOIN hs_incidents i ON i.id = v.incident_id WHERE v.id = inv;
  r := r || CASE WHEN st = 'approved/true/awaiting_actions' THEN 'PASS' ELSE 'FAIL' END
         || ' second admin approves; incident moves to awaiting actions ('||st||'); ';
  BEGIN DELETE FROM incident_investigations WHERE id = inv; GET DIAGNOSTICS n = ROW_COUNT;
    r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' investigation delete removes nothing ('||n||'); ';
  EXCEPTION WHEN others THEN r := r || 'PASS investigation delete refused; '; END;

  -- ── 5. corrective actions with verification ────────────────────────
  INSERT INTO actions (company_id, action_type, title, priority, status, source_type, source_id, action_class,
                       verification_required, assigned_to, verifier_id, evidence_required)
  VALUES (x, 'hs_corrective', 'Remove interlock bypass and add changeover time', 'high', 'active', 'investigation', inv, 'corrective',
          false, site, hsem, true) RETURNING id INTO act;
  SELECT verification_required::text INTO st FROM actions WHERE id = act;
  r := r || CASE WHEN st = 'true' THEN 'PASS' ELSE 'FAIL' END || ' verification forced on for a major incident''s action; ';
  BEGIN INSERT INTO actions (company_id, action_type, title, priority, status, source_type, source_id)
        VALUES (x, 'hs_corrective', 'born complete', 'normal', 'complete', 'incident', inc);
    r := r || 'FAIL a must-verify action was created complete; ';
  EXCEPTION WHEN others THEN r := r || 'PASS a must-verify action cannot be created complete; '; END;
  BEGIN UPDATE actions SET verification_required = false WHERE id = act;
    SELECT verification_required::text INTO st FROM actions WHERE id = act;
    r := r || CASE WHEN st = 'true' THEN 'PASS' ELSE 'FAIL' END || ' verification cannot be switched off for a major incident ('||st||'); ';
  EXCEPTION WHEN others THEN r := r || 'PASS verification cannot be switched off; '; END;
  INSERT INTO actions (company_id, action_type, title, priority, status, source_type, source_id, action_class)
  VALUES (x, 'hs_corrective', 'Refresher toolbox talk on guarding', 'normal', 'active', 'incident', inc, 'preventive') RETURNING id INTO act2;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp2, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN UPDATE actions SET status = 'complete' WHERE id = act;
    SELECT status INTO st FROM actions WHERE id = act;
    r := r || CASE WHEN st = 'active' THEN 'PASS' ELSE 'FAIL' END || ' unrelated employee cannot complete a must-verify action ('||st||'); ';
  EXCEPTION WHEN others THEN r := r || 'PASS unrelated employee cannot complete a must-verify action; '; END;
  BEGIN UPDATE actions SET completion_evidence = '{"note":"x"}', status = 'awaiting_verification' WHERE id = act; GET DIAGNOSTICS n = ROW_COUNT;
    SELECT status INTO st FROM actions WHERE id = act;
    r := r || CASE WHEN st = 'active' THEN 'PASS' ELSE 'FAIL' END || ' unrelated employee cannot submit someone else''s action for verification ('||st||'); ';
    IF st <> 'active' THEN UPDATE actions SET status = 'active', verification_rejection_reason = 'probe reset' WHERE id = act; END IF;
  EXCEPTION WHEN others THEN r := r || 'PASS unrelated employee refused outright; '; END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', site, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN UPDATE actions SET status = 'awaiting_verification' WHERE id = act;
    r := r || 'FAIL submitted for verification without evidence; ';
  EXCEPTION WHEN others THEN r := r || 'PASS evidence required before verification; '; END;
  UPDATE actions SET completion_evidence = '{"note":"Bypass removed, changeover slot added"}'::jsonb, status = 'awaiting_verification' WHERE id = act;
  SELECT status || '/' || (completed_by = site) INTO st FROM actions WHERE id = act;
  r := r || CASE WHEN st = 'awaiting_verification/true' THEN 'PASS' ELSE 'FAIL' END || ' assignee submits for verification ('||st||'); ';
  BEGIN UPDATE actions SET status = 'complete' WHERE id = act;
    r := r || 'FAIL the person who did the work verified it; ';
  EXCEPTION WHEN others THEN r := r || 'PASS self-verification refused; '; END;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', adv, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN UPDATE actions SET status = 'active' WHERE id = act;
    r := r || 'FAIL verification rejected without a reason; ';
  EXCEPTION WHEN others THEN r := r || 'PASS rejection needs a reason; '; END;
  UPDATE actions SET status = 'active', verification_rejection_reason = 'No photo of the removed bypass' WHERE id = act;
  SELECT status || '/' || (verification_rejected_by = adv) || '/' || (completed_by IS NULL) INTO st FROM actions WHERE id = act;
  r := r || CASE WHEN st = 'active/true/true' THEN 'PASS' ELSE 'FAIL' END || ' adviser rejects with reason, stamped ('||st||'); ';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', site, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE actions SET completion_evidence = '{"note":"Bypass removed","photo":"pending"}'::jsonb, status = 'awaiting_verification' WHERE id = act;
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', hsem, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE actions SET status = 'complete' WHERE id = act;
  SELECT status || '/' || (verified_by = hsem) || '/' || (completed_by = site) INTO st FROM actions WHERE id = act;
  r := r || CASE WHEN st = 'complete/true/true' THEN 'PASS' ELSE 'FAIL' END || ' named verifier verifies ('||st||'); ';
  UPDATE actions SET effectiveness_outcome = 'effective', effectiveness_reviewed_by = emp WHERE id = act;
  SELECT (effectiveness_reviewed_by = hsem)::text INTO st FROM actions WHERE id = act;
  r := r || CASE WHEN st = 'true' THEN 'PASS' ELSE 'FAIL' END || ' effectiveness review stamped to the reviewer; ';

  -- ── 6. closure ─────────────────────────────────────────────────────
  SELECT hs_incident_close_blockers(inc) INTO st;
  r := r || CASE WHEN st LIKE '%1 corrective action is still open%' AND st LIKE '%RIDDOR report has not been recorded%' THEN 'PASS' ELSE 'FAIL' END
         || ' blockers name the open action and unrecorded RIDDOR report ('||COALESCE(st,'none')||'); ';
  BEGIN UPDATE hs_incidents SET status = 'closed' WHERE id = inc;
    r := r || 'FAIL closed with blockers and no override; ';
  EXCEPTION WHEN others THEN r := r || 'PASS close blocked without override; '; END;
  BEGIN UPDATE hs_incidents SET status = 'closed', close_override_reason = 'short' WHERE id = inc;
    r := r || 'FAIL closed with a token override; ';
  EXCEPTION WHEN others THEN r := r || 'PASS token override refused; '; END;
  UPDATE riddor_reviews SET reporting_reference = 'PROBE-F2508-1', report_date = current_date WHERE id = rr;
  SELECT i.riddor_review_status || '/' || (i.riddor_reported_on = current_date) INTO st FROM hs_incidents i WHERE i.id = inc;
  r := r || CASE WHEN st = 'reported/true' THEN 'PASS' ELSE 'FAIL' END || ' hse manager records the report as made ('||st||'); ';
  UPDATE hs_incidents SET status = 'closed', close_override_reason = 'Toolbox talk scheduled for next shift; tracked separately.' WHERE id = inc;
  SELECT status || '/' || (closed_by = hsem) || '/' || (close_override_reason IS NOT NULL) INTO st FROM hs_incidents WHERE id = inc;
  r := r || CASE WHEN st = 'closed/true/true' THEN 'PASS' ELSE 'FAIL' END || ' closed with a recorded override ('||st||'); ';
  BEGIN UPDATE hs_incidents SET description = 'rewritten after closure' WHERE id = inc;
    r := r || 'FAIL closed incident edited; ';
  EXCEPTION WHEN others THEN r := r || 'PASS closed incident is locked; '; END;
  BEGIN UPDATE riddor_reviews SET notes = 'late note' WHERE id = rr;
    r := r || 'FAIL RIDDOR review edited after closure; ';
  EXCEPTION WHEN others THEN r := r || 'PASS RIDDOR review locked after closure; '; END;
  BEGIN INSERT INTO incident_people (company_id, incident_id, external_name, role_in_incident) VALUES (x, inc, 'late', 'witness');
    r := r || 'FAIL person added after closure; ';
  EXCEPTION WHEN others THEN r := r || 'PASS people locked after closure; '; END;

  -- a near miss: no severity → cannot close; hse_manager may decide RIDDOR
  INSERT INTO hs_incidents (company_id, incident_type, title, occurred_on, description, exact_location)
    VALUES (x, 'near_miss', 'Pallet fell from racking', current_date, 'No one hurt', 'Warehouse aisle 4') RETURNING id INTO inc2;
  SELECT riddor_review_status INTO st FROM hs_incidents WHERE id = inc2;
  r := r || CASE WHEN st = 'not_reviewed' THEN 'PASS' ELSE 'FAIL' END || ' near miss does not force a RIDDOR review ('||st||'); ';
  UPDATE hs_incidents SET status = 'triage' WHERE id = inc2;
  BEGIN UPDATE hs_incidents SET status = 'closed', close_override_reason = 'nothing to see here at all' WHERE id = inc2;
    r := r || 'FAIL closed without a confirmed severity; ';
  EXCEPTION WHEN others THEN r := r || 'PASS severity must be confirmed before closing; '; END;
  INSERT INTO riddor_reviews (company_id, incident_id, dangerous_occurrence, decision, rationale)
    VALUES (x, inc2, false, 'not_reportable', 'Racking collapse below the dangerous-occurrence threshold; nobody injured.') RETURNING id INTO rr2;
  SELECT status || '/' || (decision_by = hsem) INTO st FROM riddor_reviews WHERE id = rr2;
  r := r || CASE WHEN st = 'confirmed_not_reportable/true' THEN 'PASS' ELSE 'FAIL' END || ' HSE manager records a RIDDOR decision ('||st||'); ';
  UPDATE hs_incidents SET severity = 'minor' WHERE id = inc2;
  UPDATE hs_incidents SET status = 'closed' WHERE id = inc2;
  SELECT status || '/' || (close_override_reason IS NULL) INTO st FROM hs_incidents WHERE id = inc2;
  r := r || CASE WHEN st = 'closed/true' THEN 'PASS' ELSE 'FAIL' END || ' clean close needs no override ('||st||'); ';
  UPDATE hs_incidents SET status = 'archived' WHERE id = inc2;
  UPDATE hs_incidents SET status = 'triage' WHERE id = inc;
  SELECT status || '/' || (closed_at IS NULL) INTO st FROM hs_incidents WHERE id = inc;
  r := r || CASE WHEN st = 'triage/true' THEN 'PASS' ELSE 'FAIL' END || ' approver reopens a closed incident ('||st||'); ';
  RESET ROLE;

  -- ── 7. nobody deletes, staff included ──────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN DELETE FROM hs_incidents WHERE id = inc;
    r := r || 'FAIL staff deleted an incident; ';
  EXCEPTION WHEN others THEN r := r || 'PASS staff cannot delete an incident; '; END;
  BEGIN DELETE FROM incident_investigations WHERE id = inv;
    r := r || 'FAIL staff deleted an investigation; ';
  EXCEPTION WHEN others THEN r := r || 'PASS staff cannot delete an investigation; '; END;
  RESET ROLE;

  -- ── 8. what the logs carry ─────────────────────────────────────────
  SELECT count(*) INTO n FROM hs_events WHERE company_id = x AND summary ILIKE '%SECRETMEDICAL%';
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' timeline never carries the description ('||n||'); ';
  SELECT count(*) INTO n FROM audit_events WHERE organisation_id = x AND (new_value::text ILIKE '%SECRETMEDICAL%' OR previous_value::text ILIKE '%SECRETMEDICAL%');
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' audit never carries the description ('||n||'); ';
  SELECT count(*) INTO n FROM platform_events WHERE company_id = x AND payload::text ILIKE '%SECRETMEDICAL%';
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' outbox never carries the description ('||n||'); ';
  SELECT string_agg(DISTINCT action, ',' ORDER BY action) INTO st FROM audit_events WHERE organisation_id = x
     AND action ~ '^(incident|investigation|riddor|action)\.';
  r := r || 'audit actions=' || COALESCE(st, 'none') || '; ';
  SELECT string_agg(DISTINCT entity_type || '.' || event_type, ',' ORDER BY entity_type || '.' || event_type) INTO st FROM platform_events WHERE company_id = x;
  r := r || 'outbox=' || COALESCE(st, 'none') || '; ';

  RAISE EXCEPTION 'PROBE 125 (rolled back): %', r;
END $$;
