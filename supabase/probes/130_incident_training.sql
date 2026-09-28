-- Migration 130 probe (incident → training link, spec 59), 2026-09-28.
-- Run as: BEGIN; <130_incident_training_link.sql>; <this DO block>; ROLLBACK;
-- (first run, before apply) and the DO block alone afterwards. Always
-- rolled back by the RAISE. Client A: admin adm, employee emp, site
-- manager sm (grant), read-only ro (grant). Client B: admin bu.
--
-- Recorded 2026-09-28, run against 130 inside BEGIN … ROLLBACK before it
-- was applied: 30/30 PASS. (Run 1 stopped on a probe defect: a
-- `WHERE id = record_…()` called the function once per scanned row and
-- hit the one-live-check index; the probe now assigns first.) The applied
-- function bodies were then md5-matched to this migration file (5/5).
--   worker linked to a person; investigator (site manager, by grant) sees
--   Fire Warden=current, Forklift=completed_after, Manual Handling=no_expiry,
--   Working at Height=expired; external person has no evidence; "Working at
--   Height" recorded as expired 14 days before the incident, pointing at the
--   right record; untrained course = not_recorded; completion after the
--   incident shown as such; one live check per person per course; no check
--   for someone not on the records; blank course refused; no direct insert or
--   update (the finding cannot be forged); the recorded finding is unchanged
--   by a later training edit; no cause created and the incident untouched;
--   employee: no evidence, no checks, cannot record; read-only grant reads
--   the checks but cannot record or read raw evidence; client B sees and
--   records nothing; withdrawal needs a reason, keeps and stamps the row;
--   re-recording afterwards reads the current record; audited
--   (created, updated); the timeline never names the person and records
--   each check (5); a closed incident is locked.

DO $$
DECLARE r text := ''; n int; st text; e text;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); home uuid := gen_random_uuid();
  adm uuid := gen_random_uuid(); emp uuid := gen_random_uuid(); sm uuid := gen_random_uuid(); ro uuid := gen_random_uuid(); bu uuid := gen_random_uuid();
  worker uuid; wperson uuid; inc uuid; ipw uuid; ipx uuid; chk uuid; chk2 uuid; wah uuid;
BEGIN
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES
    (a, 'Probe 130 A', 'p130-a-'||left(a::text,8), 'direct_client', true),
    (b, 'Probe 130 B', 'p130-b-'||left(b::text,8), 'direct_client', true),
    (home, 'Probe 130 Home', 'p130-h-'||left(home::text,8), 'direct_client', true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', em, '', now(), now(), now(), '{}', '{}'
    FROM (VALUES (adm,'p130-adm@probe.invalid'), (emp,'p130-emp@probe.invalid'), (sm,'p130-sm@probe.invalid'),
                 (ro,'p130-ro@probe.invalid'), (bu,'p130-bu@probe.invalid')) v(id, em);
  UPDATE profiles SET role = 'client_admin', company_id = a WHERE id = adm;
  UPDATE profiles SET role = 'client_user',  company_id = a WHERE id = emp;
  UPDATE profiles SET role = 'client_user',  company_id = home WHERE id IN (sm, ro);
  UPDATE profiles SET role = 'client_admin', company_id = b WHERE id = bu;
  INSERT INTO user_organisation_access (user_id, organisation_id, role_key) VALUES (sm, a, 'site_manager'), (ro, a, 'read_only');
  INSERT INTO user_active_organisation (user_id, organisation_id) VALUES (sm, a), (ro, a);

  -- A worker with four training records, as the HR side would hold them.
  INSERT INTO employee_records (company_id, full_name, email, job_title, start_date)
    VALUES (a, 'Probe Worker', 'p130-worker@probe.invalid', 'Operative', current_date - 900) RETURNING id, person_id INTO worker, wperson;
  INSERT INTO training_records (company_id, employee_id, course_name, completed_on, expires_on) VALUES
    (a, worker, 'Working at Height', current_date - 800, current_date - 15) RETURNING id INTO wah;
  INSERT INTO training_records (company_id, employee_id, course_name, completed_on, expires_on) VALUES
    (a, worker, 'Manual Handling', current_date - 400, NULL),
    (a, worker, 'Fire Warden', current_date - 300, current_date + 100),
    (a, worker, 'Forklift', current_date, current_date + 1000);
  r := r || CASE WHEN wperson IS NOT NULL THEN 'PASS' ELSE 'FAIL' END || ' worker is linked to a person; ';

  -- The incident happened yesterday.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO hs_incidents (company_id, incident_type, title, occurred_on, description, exact_location)
    VALUES (a, 'accident', 'Fall from stepladder', current_date - 1, 'x', 'Bay 2') RETURNING id INTO inc;
  INSERT INTO incident_people (company_id, incident_id, person_id, role_in_incident) VALUES (a, inc, wperson, 'injured_person') RETURNING id INTO ipw;
  INSERT INTO incident_people (company_id, incident_id, external_name, role_in_incident) VALUES (a, inc, 'Visiting Driver', 'witness') RETURNING id INTO ipx;
  RESET ROLE;

  -- ── Evidence, as the site manager (grant) ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', sm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT string_agg(course_name || '=' || status_at_incident, ',' ORDER BY lower(course_name)) INTO st FROM incident_training_evidence(inc);
  r := r || CASE WHEN st = 'Fire Warden=current,Forklift=completed_after,Manual Handling=no_expiry,Working at Height=expired'
               THEN 'PASS' ELSE 'FAIL' END || ' investigator sees each record''s status on the incident date (' || COALESCE(st,'none') || '); ';
  SELECT count(*) INTO n FROM incident_training_evidence(inc) WHERE incident_person_id = ipx;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' an external person has no training evidence (' || n || '); ';
  -- ── Recording checks ──
  chk := record_incident_training_check(ipw, '  working at HEIGHT ', 'Ladder work at 2.4m');
  SELECT status_at_incident || '/' || (incident_date - expires_on) || ' days/' || (training_record_id = wah) INTO st FROM incident_training_checks WHERE id = chk;
  r := r || CASE WHEN st = 'expired/14 days/true' THEN 'PASS' ELSE 'FAIL' END || ' "Working at Height": expired 14 days before the incident (' || st || '); ';
  chk2 := record_incident_training_check(ipw, 'COSHH awareness', NULL);
  SELECT status_at_incident || '/' || (training_record_id IS NULL) INTO st FROM incident_training_checks WHERE id = chk2;
  r := r || CASE WHEN st = 'not_recorded/true' THEN 'PASS' ELSE 'FAIL' END || ' untrained course: no completion on record (' || st || '); ';
  chk2 := record_incident_training_check(ipw, 'Forklift', NULL);
  SELECT status_at_incident INTO st FROM incident_training_checks WHERE id = chk2;
  r := r || CASE WHEN st = 'completed_after' THEN 'PASS' ELSE 'FAIL' END || ' completion after the incident is shown as such (' || st || '); ';
  BEGIN PERFORM record_incident_training_check(ipw, 'Working at Height', NULL);
    r := r || 'FAIL a second live check for the same course accepted; ';
  EXCEPTION WHEN unique_violation THEN r := r || 'PASS one live check per person per course; '; END;
  BEGIN PERFORM record_incident_training_check(ipx, 'Working at Height', NULL);
    r := r || 'FAIL a check on an external person accepted; ';
  EXCEPTION WHEN others THEN r := r || 'PASS no check for someone not on the records; '; END;
  BEGIN PERFORM record_incident_training_check(ipw, '   ', NULL);
    r := r || 'FAIL blank course accepted; ';
  EXCEPTION WHEN others THEN r := r || 'PASS blank course refused; '; END;
  BEGIN INSERT INTO incident_training_checks (company_id, incident_id, incident_person_id, course_name, status_at_incident, incident_date)
          VALUES (a, inc, ipw, 'Forged', 'current', current_date);
    r := r || 'FAIL a session wrote a check directly; ';
  EXCEPTION WHEN others THEN r := r || 'PASS no direct insert (finding cannot be forged); '; END;
  BEGIN UPDATE incident_training_checks SET status_at_incident = 'current' WHERE id = chk; GET DIAGNOSTICS n = ROW_COUNT;
    r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' no direct update (' || n || '); ';
  EXCEPTION WHEN others THEN r := r || 'PASS no direct update; '; END;
  RESET ROLE;

  -- ── The finding is a snapshot: a later training edit does not rewrite it ──
  UPDATE training_records SET expires_on = current_date + 365 WHERE id = wah;
  SELECT status_at_incident INTO st FROM incident_training_checks WHERE id = chk;
  r := r || CASE WHEN st = 'expired' THEN 'PASS' ELSE 'FAIL' END || ' recorded finding unchanged by a later training edit (' || st || '); ';

  -- ── Nothing concluded on the investigator's behalf ──
  SELECT count(*) INTO n FROM incident_causes c JOIN incident_investigations v ON v.id = c.investigation_id WHERE v.incident_id = inc;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' no cause created automatically (' || n || '); ';
  SELECT status INTO st FROM hs_incidents WHERE id = inc;
  r := r || CASE WHEN st = 'reported' THEN 'PASS' ELSE 'FAIL' END || ' incident status untouched (' || st || '); ';

  -- ── Who else can see or do this ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', emp, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM * FROM incident_training_evidence(inc); r := r || 'FAIL employee read training evidence; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS employee cannot review training evidence; '; END;
  SELECT count(*) INTO n FROM incident_training_checks WHERE incident_id = inc;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' employee sees no training checks (' || n || '); ';
  BEGIN PERFORM record_incident_training_check(ipw, 'Anything', NULL); r := r || 'FAIL employee recorded a check; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS employee cannot record a check; '; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ro, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM incident_training_checks WHERE incident_id = inc;
  r := r || CASE WHEN n = 3 THEN 'PASS' ELSE 'FAIL' END || ' read-only grant reads the recorded checks (' || n || '); ';
  BEGIN PERFORM record_incident_training_check(ipw, 'Anything', NULL); r := r || 'FAIL read-only grant recorded a check; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS read-only grant cannot record; '; END;
  BEGIN PERFORM * FROM incident_training_evidence(inc); r := r || 'FAIL read-only grant read raw training evidence; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS read-only grant cannot read raw training evidence; '; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', bu, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM * FROM incident_training_evidence(inc); r := r || 'FAIL client B read A''s training evidence; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS client B cannot read A''s training evidence; '; END;
  SELECT count(*) INTO n FROM incident_training_checks WHERE incident_id = inc;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' client B sees none of A''s checks (' || n || '); ';
  BEGIN PERFORM record_incident_training_check(ipw, 'Anything', NULL); r := r || 'FAIL client B recorded on A''s incident; ';
  EXCEPTION WHEN insufficient_privilege THEN r := r || 'PASS client B cannot record on A''s incident; '; END;
  RESET ROLE;

  -- ── Withdraw, re-record, audit, timeline, closure lock ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM withdraw_incident_training_check(chk, ''); r := r || 'FAIL withdrawn without a reason; ';
  EXCEPTION WHEN others THEN r := r || 'PASS withdrawal needs a reason; '; END;
  PERFORM withdraw_incident_training_check(chk, 'Wrong course — ladder work is covered by Ladder Safety');
  SELECT count(*) INTO n FROM incident_training_checks WHERE id = chk AND withdrawn_at IS NOT NULL AND withdrawn_by = adm;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' withdrawn, kept, stamped; ';
  chk2 := record_incident_training_check(ipw, 'Working at Height', NULL);
  SELECT status_at_incident INTO st FROM incident_training_checks WHERE id = chk2;
  r := r || CASE WHEN st = 'current' THEN 'PASS' ELSE 'FAIL' END || ' re-recorded after withdrawal reads today''s record (' || st || '); ';
  RESET ROLE;
  SELECT string_agg(DISTINCT action, ',') INTO st FROM audit_events WHERE organisation_id = a AND action LIKE 'incident_training_check.%';
  r := r || CASE WHEN st LIKE '%created%' AND st LIKE '%updated%' THEN 'PASS' ELSE 'FAIL' END || ' audited (' || COALESCE(st,'none') || '); ';
  SELECT count(*) INTO n FROM hs_events WHERE entity_id = inc AND summary LIKE '%Probe Worker%';
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' timeline never names the person (' || n || '); ';
  SELECT count(*) INTO n FROM hs_events WHERE entity_id = inc AND summary LIKE 'Training check%';
  r := r || CASE WHEN n >= 5 THEN 'PASS' ELSE 'FAIL' END || ' timeline records each check (' || n || '); ';
  UPDATE hs_incidents SET status = 'closed', closed_at = now() WHERE id = inc;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN PERFORM record_incident_training_check(ipw, 'Manual Handling', NULL); r := r || 'FAIL recorded on a closed incident; ';
  EXCEPTION WHEN check_violation THEN r := r || 'PASS closed incident is locked; '; END;
  RESET ROLE;

  RAISE EXCEPTION 'PROBE 130 (rolled back): %', r;
END $$;
