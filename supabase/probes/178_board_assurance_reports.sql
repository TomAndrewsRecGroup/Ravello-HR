-- Rolled-back live probe for migration 178 (Board Assurance & Executive
-- Reporting, Phase 13 Group 1). Uses the simulated-session technique
-- (117/125/126/128/152) — fresh companies and auth.users rows created
-- inline, never against live seed data.

DO $$
DECLARE
  r text[] := '{}';
  co_a uuid; co_b uuid;
  staff_user uuid := gen_random_uuid();
  client_a uuid := gen_random_uuid();
  client_a2 uuid := gen_random_uuid();
  client_b uuid := gen_random_uuid();
  report_a uuid;
  ok boolean;
  err_msg text;
  ev_count int;
BEGIN
  INSERT INTO public.companies (name, slug) VALUES ('Probe178 Co A', 'probe178-co-a') RETURNING id INTO co_a;
  INSERT INTO public.companies (name, slug) VALUES ('Probe178 Co B', 'probe178-co-b') RETURNING id INTO co_b;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES
    (staff_user, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p178-staff@probe.invalid', '', now(), now(), now(), '{}', '{}'),
    (client_a,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p178-clienta@probe.invalid', '', now(), now(), now(), '{}', '{}'),
    (client_a2,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p178-clienta2@probe.invalid', '', now(), now(), now(), '{}', '{}'),
    (client_b,   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p178-clientb@probe.invalid', '', now(), now(), now(), '{}', '{}');

  UPDATE public.profiles SET role = 'tps_admin' WHERE id = staff_user;
  UPDATE public.profiles SET role = 'client_admin', company_id = co_a, full_name = 'Probe178 Client A' WHERE id = client_a;
  UPDATE public.profiles SET role = 'client_admin', company_id = co_a, full_name = 'Probe178 Client A2' WHERE id = client_a2;
  UPDATE public.profiles SET role = 'client_admin', company_id = co_b, full_name = 'Probe178 Client B' WHERE id = client_b;

  -- ── as staff: generate a draft report ──────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.board_assurance_reports (company_id, year, quarter, report_data)
    VALUES (co_a, 2026, 3, '{"overallBand":"amber","areas":[]}'::jsonb)
    RETURNING id INTO report_a;
  ok := (SELECT status = 'draft' AND generated_by = staff_user AND issued_at IS NULL FROM public.board_assurance_reports WHERE id = report_a);
  r := array_append(r, format('1. draft report created correctly: %s', ok));

  -- staff attempting to change report_data (even staff) is refused
  BEGIN
    UPDATE public.board_assurance_reports SET report_data = '{"overallBand":"red","areas":[]}'::jsonb WHERE id = report_a;
    r := array_append(r, '2. report_data change refused: false (should have raised)');
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, '2. report_data change refused: true');
  END;

  -- ── as client A: draft is invisible ────────────────────────────
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', client_a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  ok := NOT EXISTS (SELECT 1 FROM public.board_assurance_reports WHERE id = report_a);
  r := array_append(r, format('3. client A cannot see the draft report: %s', ok));

  -- ── as staff: issue it ──────────────────────────────────────────
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.board_assurance_reports SET status = 'issued' WHERE id = report_a;
  ok := (SELECT status = 'issued' AND issued_at IS NOT NULL AND issued_by = staff_user FROM public.board_assurance_reports WHERE id = report_a);
  r := array_append(r, format('4. issue transition stamps issued_at/issued_by: %s', ok));

  -- un-issuing is refused
  BEGIN
    UPDATE public.board_assurance_reports SET status = 'draft' WHERE id = report_a;
    r := array_append(r, '5. un-issue refused: false (should have raised)');
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, '5. un-issue refused: true');
  END;

  -- ── as client A: now visible ────────────────────────────────────
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', client_a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  ok := EXISTS (SELECT 1 FROM public.board_assurance_reports WHERE id = report_a);
  r := array_append(r, format('6. client A sees the issued report: %s', ok));

  -- ── as client B: cross-org denied ───────────────────────────────
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', client_b, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  ok := NOT EXISTS (SELECT 1 FROM public.board_assurance_reports WHERE id = report_a);
  r := array_append(r, format('7. client B (different company) cannot see it: %s', ok));

  -- attempting to acknowledge someone else's report, claiming own company_id
  BEGIN
    INSERT INTO public.board_assurance_acknowledgements (report_id, company_id) VALUES (report_a, co_b);
    r := array_append(r, '8. cross-org acknowledgement refused: false (should have raised)');
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, '8. cross-org acknowledgement refused: true');
  END;

  -- ── as client A: acknowledge the issued report ──────────────────
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', client_a, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.board_assurance_acknowledgements (report_id, company_id) VALUES (report_a, co_a);
  ok := (SELECT company_id = co_a AND acknowledged_by = client_a AND acknowledged_by_name = 'Probe178 Client A'
         FROM public.board_assurance_acknowledgements WHERE report_id = report_a AND acknowledged_by = client_a);
  r := array_append(r, format('9. acknowledgement filled correctly (company_id/acknowledged_by/name never trusted from caller): %s', ok));

  -- duplicate acknowledgement by the same person is refused (unique)
  BEGIN
    INSERT INTO public.board_assurance_acknowledgements (report_id, company_id) VALUES (report_a, co_a);
    r := array_append(r, '10. duplicate acknowledgement refused: false (should have raised)');
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, '10. duplicate acknowledgement refused: true');
  END;

  -- a second board member (client_a2) may still acknowledge separately
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', client_a2, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  INSERT INTO public.board_assurance_acknowledgements (report_id, company_id) VALUES (report_a, co_a);
  ok := (SELECT count(*) = 2 FROM public.board_assurance_acknowledgements WHERE report_id = report_a);
  r := array_append(r, format('11. a second board member acknowledges the same report independently: %s', ok));

  -- client A can read both acknowledgements
  ok := (SELECT count(*) = 2 FROM public.board_assurance_acknowledgements WHERE report_id = report_a AND company_id = co_a);
  r := array_append(r, format('12. client A reads both acknowledgements: %s', ok));

  -- ── back to staff: acknowledging a DRAFT report is refused ──────
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_user, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  DECLARE report_draft2 uuid;
  BEGIN
    INSERT INTO public.board_assurance_reports (company_id, year, quarter, report_data)
      VALUES (co_a, 2026, 4, '{"overallBand":"green","areas":[]}'::jsonb)
      RETURNING id INTO report_draft2;
    RESET ROLE;
    PERFORM set_config('request.jwt.claims', json_build_object('sub', client_a, 'role', 'authenticated')::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      INSERT INTO public.board_assurance_acknowledgements (report_id, company_id) VALUES (report_draft2, co_a);
      r := array_append(r, '13. acknowledging a draft report refused: false (should have raised)');
    EXCEPTION WHEN OTHERS THEN
      r := array_append(r, '13. acknowledging a draft report refused: true');
    END;
  END;

  -- ── back to a superuser-equivalent context for structural checks ─
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  ok := (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.board_assurance_reports'::regclass);
  r := array_append(r, format('14. RLS enabled on board_assurance_reports: %s', ok));
  ok := (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.board_assurance_acknowledgements'::regclass);
  r := array_append(r, format('15. RLS enabled on board_assurance_acknowledgements: %s', ok));

  ok := NOT has_function_privilege('anon', 'public.board_assurance_reports_guard()', 'EXECUTE');
  r := array_append(r, format('16. board_assurance_reports_guard() not anon-executable: %s', ok));
  ok := NOT has_function_privilege('anon', 'public.board_assurance_acknowledgements_fill()', 'EXECUTE');
  r := array_append(r, format('17. board_assurance_acknowledgements_fill() not anon-executable: %s', ok));

  -- apply_write_guard() creates RESTRICTIVE POLICIES (write_guard_ins/
  -- upd/del), not a trigger — checked against its own live definition
  -- before writing this assertion.
  ok := (SELECT count(*) = 3 FROM pg_policy
         WHERE polrelid = 'public.board_assurance_acknowledgements'::regclass
           AND polname IN ('write_guard_ins', 'write_guard_upd', 'write_guard_del'));
  r := array_append(r, format('18. write guard policies applied to board_assurance_acknowledgements: %s', ok));

  SELECT count(*) INTO ev_count FROM public.platform_events
    WHERE entity_type = 'board_assurance_reports' AND entity_id = report_a;
  ok := ev_count >= 2; -- one created, one updated (issued)
  r := array_append(r, format('19. outbox recorded created + issued events: %s (count=%s)', ok, ev_count));

  RAISE EXCEPTION 'PROBE 178 (rolled back): %', array_to_string(r, ' | ');
END $$;
