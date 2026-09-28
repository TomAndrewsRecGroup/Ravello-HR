-- Phase 2 Senior QA attack probe (2026-09-28): the QA command items
-- that needed live evidence beyond 123-126's probes. One transaction,
-- always rolled back. Client A (admins a1/a2, assessor a3, employee e, recruiter rec
-- and site manager sm by grant) and client B (admin b).
--   QA5  risk calculation boundaries   QA6  v1/v2/v3 immutability
--   QA7  template safety               QA17 RIDDOR scenarios
--   QA18 RIDDOR permission (recruiter) QA21 employee limits
--   QA22 storage attack                QA25 audit deletion
--   QA30 concurrent (stale) edit
-- Expected: every line reads PASS. Recorded result at the end.

DO $$
DECLARE
  r text := ''; n int; st text; ok boolean;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); home uuid := gen_random_uuid();
  a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid(); a3 uuid := gen_random_uuid(); e uuid := gen_random_uuid();
  rec uuid := gen_random_uuid(); sm uuid := gen_random_uuid(); bu uuid := gen_random_uuid(); staff uuid := '7434b282-0b17-4e6f-9fe1-65fb383fb8a5';
  mx uuid; v1 uuid; v2 uuid; v3 uuid; it1 uuid; tpl uuid; fromtpl uuid; tplv int; hzA uuid; hzB uuid; inc uuid; rv int; f text;
  flag text;
BEGIN
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES
    (a, 'Probe QA Client A', 'pqa-a-'||left(a::text,8), 'direct_client', true),
    (b, 'Probe QA Client B', 'pqa-b-'||left(b::text,8), 'direct_client', true),
    (home, 'Probe QA Home', 'pqa-h-'||left(home::text,8), 'direct_client', true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  SELECT id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', em, '', now(), now(), now(), '{}', '{}'
    FROM (VALUES (a1,'pqa-a1@probe.invalid'), (a2,'pqa-a2@probe.invalid'), (a3,'pqa-a3@probe.invalid'), (e,'pqa-e@probe.invalid'), (rec,'pqa-rec@probe.invalid'),
                 (sm,'pqa-sm@probe.invalid'), (bu,'pqa-b@probe.invalid')) v(id, em);
  UPDATE profiles SET role = 'client_admin', company_id = a WHERE id IN (a1, a2, a3);
  UPDATE profiles SET role = 'client_user',  company_id = a WHERE id = e;
  UPDATE profiles SET role = 'client_user',  company_id = home WHERE id IN (rec, sm);
  UPDATE profiles SET role = 'client_admin', company_id = b WHERE id = bu;
  INSERT INTO user_organisation_access (user_id, organisation_id, role_key) VALUES (rec, a, 'recruiter'), (sm, a, 'site_manager');
  INSERT INTO user_active_organisation (user_id, organisation_id) VALUES (rec, a), (sm, a);
  SELECT id INTO mx FROM risk_matrices WHERE company_id IS NULL AND is_default;

  -- ── QA5 risk calculation, as A's admin ─────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a1, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO risk_assessments (company_id, title, risk_matrix_id, review_date, assessor_id) VALUES (a, 'QA RA', mx, current_date + 365, a3) RETURNING id INTO v1;
  INSERT INTO risk_assessment_items (company_id, risk_assessment_id, hazard_description, likelihood_before, severity_before, likelihood_after, severity_after)
    VALUES (a, v1, 'corner 1x1', 1, 1, 1, 1), (a, v1, 'corner 1x5', 1, 5, 1, 5), (a, v1, 'corner 5x1', 5, 1, 5, 1),
           (a, v1, 'corner 5x5', 5, 5, 3, 3);
  SELECT string_agg(hazard_description || '=' || initial_risk_score || '/' || hs_risk_level(m.bands, initial_risk_score), ',' ORDER BY hazard_description)
    INTO st FROM risk_assessment_items i JOIN risk_matrices m ON m.id = mx WHERE i.risk_assessment_id = v1;
  r := r || CASE WHEN st = 'corner 1x1=1/low,corner 1x5=5/medium,corner 5x1=5/medium,corner 5x5=25/very_high' THEN 'PASS' ELSE 'FAIL' END || ' matrix corners (' || st || '); ';
  FOREACH f IN ARRAY ARRAY['0|3','6|3','3|6','-1|3','3|0'] LOOP
    BEGIN
      INSERT INTO risk_assessment_items (company_id, risk_assessment_id, hazard_description, likelihood_before, severity_before)
        VALUES (a, v1, 'bad', split_part(f, '|', 1)::int, split_part(f, '|', 2)::int);
      r := r || 'FAIL rating ' || f || ' accepted; ';
    EXCEPTION WHEN others THEN r := r || 'PASS rating ' || f || ' refused; '; END;
  END LOOP;
  BEGIN INSERT INTO risk_assessment_items (company_id, risk_assessment_id, hazard_description, likelihood_before, severity_before) VALUES (a, v1, 'bad', NULL, 3);
    r := r || 'FAIL null likelihood accepted; ';
  EXCEPTION WHEN others THEN r := r || 'PASS null likelihood refused; '; END;
  BEGIN INSERT INTO risk_assessment_items (company_id, risk_assessment_id, hazard_description, likelihood_before, severity_before, likelihood_after, severity_after) VALUES (a, v1, 'bad', 2, 2, 3, 3);
    r := r || 'FAIL residual above initial accepted; ';
  EXCEPTION WHEN others THEN r := r || 'PASS residual above initial refused; '; END;
  BEGIN INSERT INTO risk_assessment_items (company_id, risk_assessment_id, hazard_description, likelihood_before, severity_before, likelihood_after) VALUES (a, v1, 'bad', 2, 2, 1);
    r := r || 'FAIL half a residual accepted; ';
  EXCEPTION WHEN others THEN r := r || 'PASS half a residual refused; '; END;
  BEGIN EXECUTE 'INSERT INTO risk_assessment_items (company_id, risk_assessment_id, hazard_description, likelihood_before, severity_before) VALUES ($1, $2, $3, ''three''::int, 3)' USING a, v1, 'bad';
    r := r || 'FAIL malformed rating accepted; ';
  EXCEPTION WHEN others THEN r := r || 'PASS malformed rating refused; '; END;
  BEGIN UPDATE risk_assessment_items SET initial_risk_score = 1 WHERE risk_assessment_id = v1;
    r := r || 'FAIL stored score overwritten; ';
  EXCEPTION WHEN others THEN r := r || 'PASS stored score is computed, not writable; '; END;

  -- ── QA6 versioning, QA30 concurrent edit ───────────────────────────
  UPDATE risk_assessments SET status = 'pending_review' WHERE id = v1;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a2, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE risk_assessments SET status = 'approved' WHERE id = v1;
  v2 := hs_new_version('risk_assessment', v1);
  UPDATE risk_assessment_items SET hazard_description = 'corner 5x5 — revised in v2' WHERE risk_assessment_id = v2 AND hazard_description = 'corner 5x5';
  SELECT row_version INTO rv FROM risk_assessments WHERE id = v2;
  UPDATE risk_assessments SET title = 'QA RA (manager A)', review_date = current_date + 365 WHERE id = v2 AND row_version = rv; GET DIAGNOSTICS n = ROW_COUNT;
  UPDATE risk_assessments SET title = 'QA RA (manager B, stale)' WHERE id = v2 AND row_version = rv; GET DIAGNOSTICS n = ROW_COUNT;
  SELECT title INTO st FROM risk_assessments WHERE id = v2;
  r := r || CASE WHEN n = 0 AND st = 'QA RA (manager A)' THEN 'PASS' ELSE 'FAIL' END || ' stale edit matches no row, newer edit kept (' || st || '); ';
  UPDATE risk_assessments SET status = 'pending_review' WHERE id = v2;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a1, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE risk_assessments SET status = 'approved' WHERE id = v2;
  v3 := hs_new_version('risk_assessment', v2);
  SELECT string_agg(version || ':' || status, ',' ORDER BY version) INTO st FROM risk_assessments WHERE reference = (SELECT reference FROM risk_assessments WHERE id = v1) AND company_id = a;
  r := r || CASE WHEN st = '1:superseded,2:approved,3:draft' THEN 'PASS' ELSE 'FAIL' END || ' version chain (' || st || '); ';
  SELECT hazard_description INTO st FROM risk_assessment_items WHERE risk_assessment_id = v1 AND hazard_description LIKE 'corner 5x5%';
  r := r || CASE WHEN st = 'corner 5x5' THEN 'PASS' ELSE 'FAIL' END || ' v1 item unchanged by the v2 edit; ';
  FOREACH f IN ARRAY ARRAY[v1::text, v2::text] LOOP
    BEGIN UPDATE risk_assessments SET title = 'rewrite history' WHERE id = f::uuid;
      SELECT title INTO st FROM risk_assessments WHERE id = f::uuid;
      r := r || CASE WHEN st <> 'rewrite history' THEN 'PASS' ELSE 'FAIL' END || ' historical version header not rewritten; ';
    EXCEPTION WHEN others THEN r := r || 'PASS historical version header refused; '; END;
    BEGIN UPDATE risk_assessment_items SET hazard_description = 'rewrite' WHERE risk_assessment_id = f::uuid;
      SELECT count(*) INTO n FROM risk_assessment_items WHERE risk_assessment_id = f::uuid AND hazard_description = 'rewrite';
      r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' historical items not rewritten; ';
    EXCEPTION WHEN others THEN r := r || 'PASS historical items refused; '; END;
    BEGIN DELETE FROM risk_assessments WHERE id = f::uuid; GET DIAGNOSTICS n = ROW_COUNT;
      r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' historical version not deleted; ';
    EXCEPTION WHEN others THEN r := r || 'PASS historical version delete refused; '; END;
  END LOOP;

  -- ── QA7 template safety ─────────────────────────────────────────────
  SELECT id, version INTO tpl, tplv FROM hs_templates WHERE kind = 'risk_assessment' AND owner_company_id IS NULL ORDER BY created_at LIMIT 1;
  fromtpl := hs_instantiate_template(tpl, NULL, 'QA from template', NULL);
  SELECT count(*) INTO n FROM risk_assessment_items WHERE risk_assessment_id = fromtpl;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE hs_templates SET content = jsonb_set(content, '{items}', '[]'::jsonb) WHERE id = tpl;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a1, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO rv FROM risk_assessment_items WHERE risk_assessment_id = fromtpl;
  SELECT hs_template_update_available(tpl, tplv) INTO ok;
  r := r || CASE WHEN n > 0 AND rv = n AND ok THEN 'PASS' ELSE 'FAIL' END || ' template edit leaves the live assessment alone (' || n || '→' || rv || ' items) and flags an update (' || ok || '); ';

  -- ── QA17 RIDDOR decision support per scenario ───────────────────────
  FOREACH flag IN ARRAY ARRAY['death','specified_injury','over_seven_day_incapacity','dangerous_occurrence','occupational_disease','gas_incident','non_worker_hospital'] LOOP
    INSERT INTO hs_incidents (company_id, incident_type, title, occurred_on, description, exact_location) VALUES (a, 'injury', 'QA ' || flag, current_date, 'x', 'QA') RETURNING id INTO inc;
    EXECUTE format('INSERT INTO riddor_reviews (company_id, incident_id, %I) VALUES ($1, $2, true)', flag) USING a, inc;
    SELECT r2.status || '/' || i.riddor_reportable || '/' || (r2.decision IS NULL) INTO st FROM riddor_reviews r2 JOIN hs_incidents i ON i.id = r2.incident_id WHERE r2.incident_id = inc;
    r := r || CASE WHEN st = 'potentially_reportable/false/true' THEN 'PASS' ELSE 'FAIL' END || ' ' || flag || ' prompts, never decides (' || st || '); ';
  END LOOP;
  INSERT INTO hs_incidents (company_id, incident_type, title, occurred_on, description, exact_location) VALUES (a, 'near_miss', 'QA minor', current_date, 'x', 'QA') RETURNING id INTO inc;
  SELECT riddor_review_status INTO st FROM hs_incidents WHERE id = inc;
  r := r || CASE WHEN st = 'not_reviewed' THEN 'PASS' ELSE 'FAIL' END || ' a minor near miss raises no RIDDOR review; ';
  RESET ROLE;

  -- ── QA18 RIDDOR as a recruiter; QA21 what an employee can see ───────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', rec, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN UPDATE riddor_reviews SET decision = 'not_reportable', rationale = 'recruiter view' WHERE company_id = a; GET DIAGNOSTICS n = ROW_COUNT;
    r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' recruiter decides no RIDDOR (' || n || '); ';
  EXCEPTION WHEN others THEN r := r || 'PASS recruiter cannot decide RIDDOR; '; END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', e, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM hs_incidents WHERE company_id = a;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' employee sees no one else''s incidents (' || n || '); ';
  SELECT count(*) INTO n FROM riddor_reviews WHERE company_id = a;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' employee sees no RIDDOR decisions (' || n || '); ';
  SELECT count(*) INTO n FROM risk_assessments WHERE company_id = a;
  r := r || 'employee sees ' || n || ' risk assessments (risk.read decides); ';
  RESET ROLE;

  -- ── QA22 storage attack: B against A's evidence ─────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a1, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO hazards (company_id, title, linked_location) VALUES (a, 'QA A hazard', 'A') RETURNING id INTO hzA;
  INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('hs-evidence', a::text || '/hazard/' || hzA::text || '/qa-photo.jpg', a1);
  INSERT INTO hs_files (company_id, entity_type, entity_id, storage_path, file_name, mime_type, evidence_type)
    VALUES (a, 'hazard', hzA, a::text || '/hazard/' || hzA::text || '/qa-photo.jpg', 'qa-photo.jpg', 'image/jpeg', 'photo');
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', bu, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'hs-evidence' AND name LIKE a::text || '/%';
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' B cannot list A''s evidence objects (' || n || '); ';
  SELECT count(*) INTO n FROM hs_files WHERE company_id = a;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' B cannot read A''s evidence rows (' || n || '); ';
  BEGIN INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('hs-evidence', a::text || '/hazard/' || hzA::text || '/planted.jpg', bu);
    r := r || 'FAIL B wrote into A''s evidence folder; ';
  EXCEPTION WHEN others THEN r := r || 'PASS B cannot write into A''s folder; '; END;
  INSERT INTO hazards (company_id, title, linked_location) VALUES (b, 'QA B hazard', 'B') RETURNING id INTO hzB;
  BEGIN INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('hs-evidence', b::text || '/hazard/' || hzB::text || '/../../' || a::text || '/hazard/' || hzA::text || '/traverse.jpg', bu);
    SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'hs-evidence' AND name LIKE a::text || '/%';
    r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' a ../ key stays inside B''s own folder (A objects visible: ' || n || '); ';
  EXCEPTION WHEN others THEN r := r || 'PASS ../ key refused; '; END;
  BEGIN INSERT INTO hs_files (company_id, entity_type, entity_id, storage_path, file_name, mime_type)
          VALUES (b, 'hazard', hzB, a::text || '/hazard/' || hzA::text || '/qa-photo.jpg', 'steal.jpg', 'image/jpeg');
    r := r || 'FAIL B registered A''s object as its own evidence; ';
  EXCEPTION WHEN others THEN r := r || 'PASS B cannot point an evidence row at A''s object; '; END;
  BEGIN INSERT INTO hs_files (company_id, entity_type, entity_id, storage_path, file_name, mime_type)
          VALUES (b, 'hazard', hzA, b::text || '/hazard/' || hzA::text || '/x.jpg', 'x.jpg', 'image/jpeg');
    r := r || 'FAIL B attached evidence to A''s hazard; ';
  EXCEPTION WHEN others THEN r := r || 'PASS B cannot attach evidence to A''s record; '; END;
  RESET ROLE;

  -- ── QA25 audit trail cannot be erased ───────────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', a1, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN DELETE FROM audit_events WHERE organisation_id = a; GET DIAGNOSTICS n = ROW_COUNT;
    r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' org admin deletes no audit rows (' || n || '); ';
  EXCEPTION WHEN others THEN r := r || 'PASS org admin cannot delete audit rows; '; END;
  RESET ROLE;
  BEGIN DELETE FROM audit_events WHERE organisation_id = a;
    r := r || 'FAIL audit rows deleted by the owner role; ';
  EXCEPTION WHEN others THEN r := r || 'PASS audit is append-only even for the owner role; '; END;
  SELECT string_agg(DISTINCT action, ',' ORDER BY action) INTO st FROM audit_events WHERE organisation_id = a AND action ~ '^(risk|hazard|riddor|incident)\.';
  r := r || 'audit actions=' || COALESCE(st, 'none') || '; ';

  RAISE EXCEPTION 'PROBE 128 QA (rolled back): %', r;
END $$;

-- Recorded 2026-09-28, run 3 (runs 1-2 stopped on probe fixtures, not on
-- system defects: the RA had no assessor, and hs_new_version deliberately
-- drops review_date so v2 needs its own before submit). 41/41 PASS —
--   QA5  matrix corners 1x1=1/low, 1x5=5/medium, 5x1=5/medium, 5x5=25/very_high; ratings 0, 6, -1 and a
--        0 severity refused; NULL, malformed ('three'), residual above initial and half a residual refused;
--        the stored score is generated and cannot be written.
--   QA30 a stale row_version edit matches no row; the newer edit is kept.
--   QA6  chain 1:superseded,2:approved,3:draft; the v2 edit left v1's item unchanged; header, item and
--        delete refused on both historical versions.
--   QA7  a staff edit to the template (items emptied) left the live assessment at 3→3 items, and
--        hs_template_update_available() reports the update.
--   QA17 each of the seven RIDDOR flags → potentially_reportable / riddor_reportable=false / no decision;
--        a minor near miss stays not_reviewed.
--   QA18 a recruiter's RIDDOR decision updates 0 rows.   QA21 an employee sees 0 incidents, 0 RIDDOR rows,
--        0 risk assessments (client_user holds no risk.read).
--   QA22 B lists 0 of A's objects and 0 of A's hs_files; cannot write into A's folder; a '../' key is
--        stored inside B's folder and exposes nothing of A; cannot point an hs_files row at A's object
--        or attach evidence to A's hazard.
--   QA25 an org admin cannot delete audit rows, and neither can the owner role (append-only trigger).
--
-- Audit coverage follow-up (the run-3 summary regex looked for 'risk_assessment.', but the entity is
-- 'risk'): the same RA create → submit (a1) → approve (a2), and a RIDDOR decision by a1, recorded
--   incident.reported by a1, incident.updated by a1 (×2), riddor.reviewed by a1,
--   risk.created by a1, risk.submitted by a1, risk.approved by a2.
