-- Phase 1 regression probe for the PROTECTED systems, at the database
-- layer (the app-layer workflows are covered by the vitest suites). Runs
-- the real writes each workflow makes — as the service role where the
-- app uses it (cron, public routes), as staff or client sessions where
-- the app uses those — and RAISEs, so everything is rolled back.
-- Expected: every line PASS.

DO $$
DECLARE r text := ''; n int; txt text;
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); staff uuid := '7434b282-0b17-4e6f-9fe1-65fb383fb8a5';
  req uuid; cand1 uuid; cand2 uuid; ath uuid; plan uuid; emp uuid; doc uuid; ack uuid; inv uuid; lc uuid; partner uuid;
BEGIN
  INSERT INTO companies (id, name, slug) VALUES (a, 'Reg A', 'reg-a-'||left(a::text,8)), (b, 'Reg B', 'reg-b-'||left(b::text,8)), (c, 'Reg C', 'reg-c-'||left(c::text,8));
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (ua,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','reg-a@reg.invalid','',now(),now(),now(),'{}','{}'),
         (ub,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','reg-b@reg.invalid','',now(),now(),now(),'{}','{}');
  UPDATE profiles SET role='client_admin', company_id=a WHERE id=ua;
  UPDATE profiles SET role='client_admin', company_id=b WHERE id=ub;

  -- ── Referrals (the cron writes with the service role) ──
  SET LOCAL ROLE service_role;
  INSERT INTO requisitions (company_id, title) VALUES (a, 'Reg role') RETURNING id INTO req;
  INSERT INTO candidates (company_id, requisition_id, full_name, email, source, pipeline_stage)
    VALUES (a, req, 'Dup Person', 'Dup@Reg.invalid', 'job_board', 'applied') RETURNING id INTO cand1;
  INSERT INTO candidates (company_id, requisition_id, full_name, email, source, pipeline_stage)
    VALUES (a, req, 'Dup Person', 'dup@reg.invalid', 'job_board', 'applied') RETURNING id INTO cand2;
  SELECT count(DISTINCT person_id) INTO n FROM candidates WHERE id IN (cand1, cand2);
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' referral: same applicant twice → one person (case-insensitive email); ';
  INSERT INTO referral_applications (candidate_id, requisition_id, company_id, manatal_candidate_id, status)
    VALUES (cand1, req, a, 'M-1', 'qualified');
  BEGIN
    INSERT INTO referral_applications (candidate_id, requisition_id, company_id, manatal_candidate_id, status)
      VALUES (cand2, req, a, 'M-1', 'qualified');
    r := r || 'FAIL referral: duplicate claim accepted; ';
  EXCEPTION WHEN unique_violation THEN r := r || 'PASS referral: UNIQUE(manatal_candidate_id, requisition_id) still refuses a second claim; '; END;
  UPDATE referral_applications SET status = 'email_sent' WHERE manatal_candidate_id = 'M-1' AND requisition_id = req AND status = 'qualified';
  GET DIAGNOSTICS n = ROW_COUNT; r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' referral: conditional claim-then-send update still counts 1; ';
  UPDATE referral_applications SET status = 'email_sent' WHERE manatal_candidate_id = 'M-1' AND requisition_id = req AND status = 'qualified';
  GET DIAGNOSTICS n = ROW_COUNT; r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' referral: a second send claim matches 0 rows; ';
  FOREACH txt IN ARRAY ARRAY['applied_to_partner','accepted','fee_due','paid'] LOOP
    BEGIN UPDATE referral_applications SET status = txt WHERE manatal_candidate_id = 'M-1';
    EXCEPTION WHEN OTHERS THEN r := r || 'FAIL referral: downstream '||txt||' refused ('||SQLERRM||'); '; END;
  END LOOP;
  SELECT status INTO txt FROM referral_applications WHERE manatal_candidate_id = 'M-1';
  r := r || CASE WHEN txt = 'paid' THEN 'PASS' ELSE 'FAIL' END || ' referral: downstream stages through to paid ('||txt||'); ';
  SELECT count(*) INTO n FROM audit_events WHERE entity_type = 'referral_applications' AND entity_id IN (SELECT id::text FROM referral_applications WHERE manatal_candidate_id = 'M-1');
  r := r || CASE WHEN n >= 5 THEN 'PASS' ELSE 'FAIL' END || ' referral: every status change audited ('||n||'); ';

  -- ── Athletes to Industry (public sign-up writes with the service role) ──
  INSERT INTO athletes (company_id, full_name, email, source) VALUES (a, 'Reg Athlete', 'ath@reg.invalid', 'referral_link') RETURNING id INTO ath;
  SELECT count(*) INTO n FROM athletes WHERE id = ath AND person_id IS NOT NULL;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' A2I: sign-up creates athlete linked to a person; ';
  INSERT INTO partners (company_name, active) VALUES ('Reg Partner', true) RETURNING id INTO partner;
  INSERT INTO athlete_partner_interests (athlete_id, partner_id, status) VALUES (ath, partner, 'interested');
  INSERT INTO dev_plans (company_id, athlete_id, title, status) VALUES (a, ath, 'Reg plan', 'active') RETURNING id INTO plan;
  INSERT INTO dev_plan_milestones (plan_id, title) VALUES (plan, 'Reg milestone');
  RESET ROLE;

  -- ── Billing (staff raise; client reads own; audited) ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO one_off_invoices (company_id, package, description, amount_net_pence, tax_pence, currency, payment_terms_days, invoice_date, due_date, recipient_email, status)
    VALUES (a, 'PROTECT', 'Reg site visit', 50000, 10000, 'gbp', 14, current_date, current_date + 14, 'reg-a@reg.invalid', 'open') RETURNING id INTO inv;
  SELECT billing_source || '/' || billing_provider INTO txt FROM one_off_invoices WHERE id = inv;
  r := r || CASE WHEN txt = 'one_off/stripe' THEN 'PASS' ELSE 'FAIL' END || ' billing: existing insert shape still valid, defaults '||txt||'; ';
  -- ── Broadcast (staff inserts one action per selected client) ──
  INSERT INTO actions (company_id, action_type, title, priority, status, created_by_admin)
    SELECT x, 'broadcast', 'Reg broadcast', 'normal', 'active', true FROM unnest(ARRAY[a, b]) x;
  -- ── Documents + policy acknowledgement evidence ──
  INSERT INTO employee_records (company_id, full_name, email, job_title, start_date) VALUES (a, 'Reg Employee', 'e@reg.invalid', 'Op', current_date) RETURNING id INTO emp;
  INSERT INTO documents (company_id, name, category, file_path, version, status, requires_approval)
    VALUES (a, 'Reg handbook', 'policy', a::text || '/h.pdf', 1, 'active', false) RETURNING id INTO doc;
  INSERT INTO policy_acknowledgements (company_id, document_id, employee_id, status) VALUES (a, doc, emp, 'pending') RETURNING id INTO ack;
  RESET ROLE;
  SET LOCAL ROLE service_role;   -- the public link route acknowledges with the service role
  UPDATE policy_acknowledgements SET status = 'acknowledged', acknowledged_at = now(), acknowledged_via = 'link',
         ip_address = '203.0.113.9', user_agent = 'probe', auth_evidence = '{"method":"emailed_single_person_link"}'
   WHERE id = ack AND status IN ('pending','overdue');
  SELECT count(*) INTO n FROM policy_acknowledgements pa JOIN document_versions v ON v.id = pa.document_version_id
   WHERE pa.id = ack AND pa.person_id IS NOT NULL AND pa.ip_address = '203.0.113.9' AND v.version = 1;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' policy ack: person, exact version and IP recorded; ';
  RESET ROLE;

  -- ── Client A / B / C isolation over the protected data ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ua, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM actions WHERE title = 'Reg broadcast'; r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' broadcast: A sees exactly its own copy ('||n||'); ';
  SELECT count(*) INTO n FROM one_off_invoices WHERE id = inv; r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' billing: A reads its invoice; ';
  SELECT count(*) INTO n FROM athletes WHERE id = ath; r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' A2I: A sees its athlete; ';
  SELECT count(*) INTO n FROM dev_plans WHERE id = plan; r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' dev plan: A sees its active plan; ';
  SELECT count(*) INTO n FROM dev_plan_milestones WHERE plan_id = plan; r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' dev plan: A sees its milestone; ';
  SELECT count(*) INTO n FROM people WHERE id = (SELECT person_id FROM athletes WHERE id = ath); r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' person: A sees its athlete person; ';
  SELECT count(*) INTO n FROM candidates WHERE id IN (cand1, cand2); r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' referral: A cannot see unshared applicants; ';
  SELECT count(*) INTO n FROM people WHERE id = (SELECT person_id FROM candidates WHERE id = cand1); r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' person: unshared applicant stays hidden as a person; ';
  SELECT count(*) INTO n FROM learning_content WHERE is_published; r := r || CASE WHEN n >= 1 THEN 'PASS' ELSE 'FAIL' END || ' e-learning: published catalogue readable ('||n||'); ';
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', ub, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM actions WHERE title = 'Reg broadcast'; r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' broadcast: B sees exactly its own copy; ';
  SELECT count(*) INTO n FROM one_off_invoices WHERE id = inv; r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' billing: B cannot read A''s invoice; ';
  SELECT count(*) INTO n FROM athletes WHERE id = ath; r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' A2I: B cannot see A''s athlete; ';
  SELECT count(*) INTO n FROM dev_plans WHERE id = plan; r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' dev plan: B cannot see A''s plan; ';
  SELECT count(*) INTO n FROM policy_acknowledgements WHERE id = ack; r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' policy ack: B cannot see A''s; ';
  RESET ROLE;
  -- C was never selected: no action row exists for C at all.
  SELECT count(*) INTO n FROM actions WHERE title = 'Reg broadcast' AND company_id = c;
  r := r || CASE WHEN n = 0 THEN 'PASS' ELSE 'FAIL' END || ' broadcast: unselected C received nothing; ';
  SELECT count(*) INTO n FROM audit_events WHERE action = 'action.created' AND organisation_id IN (a, b) AND new_value->>'source_type' IS NULL;
  r := r || CASE WHEN n >= 2 THEN 'PASS' ELSE 'FAIL' END || ' broadcast: one audited action per recipient ('||n||'); ';
  SELECT count(*) INTO n FROM audit_events WHERE action = 'invoice.created' AND organisation_id = a;
  r := r || CASE WHEN n = 1 THEN 'PASS' ELSE 'FAIL' END || ' billing: invoice creation audited; ';
  RAISE EXCEPTION 'REGRESSION PROBE (rolled back): %', r;
END $$;
