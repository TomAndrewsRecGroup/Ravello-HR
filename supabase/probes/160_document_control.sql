-- Live probe for migration 160 (Core-OS 360 Phase 5, Group 5:
-- Controlled Document Management). Run inside BEGIN/ROLLBACK against
-- project sbmekaviwkiyorvmtgcu — never applied for real.
--
-- Run 2026-09-29: 16/16 PASS (against the live, applied migration).
--
--   check1_full_lifecycle          — draft -> pending_review -> pending_approval
--                                     -> approved -> active all succeed in order
--   check2_self_approval_refused_data — approver_id = author_id refused at INSERT (CHECK)
--   check3_self_approval_refused_session — the ACTING SESSION being the author
--                                     is refused even when a different approver is named
--   check4_staff_approval_allowed  — a different staff approver succeeds
--   check5_review_bypass_refused   — draft -> pending_approval directly, with a
--                                     reviewer named, is refused
--   check6_review_bypass_ok_no_reviewer — draft -> pending_approval with NO
--                                     reviewer named succeeds
--   check7_content_immutable       — title/category cannot change on an approved row
--   check8_admin_metadata_movable  — review_due_at CAN still change on an approved row
--   check9_effective_future_refused — approved -> active refused while effective_from is future
--   check10_effective_past_ok      — approved -> active succeeds once effective_from has passed
--   check11_supersede_on_publish   — v2 reaching 'active' flips v1 (still active
--                                     throughout v2's review) to superseded; v1 stays SELECTable
--   check12_ack_pinned_to_version  — an acknowledgement naming v1's id is unaffected
--                                     when later versions are created and published
--   check13_bad_transition_refused — an impossible jump (draft -> superseded) is refused
--   check14_rls_enabled            — RLS is ON for hs_documents
--   check15_no_delete_grant        — no DELETE privilege for authenticated/anon (rule 8: no
--                                     auto-delete path exists anywhere for this table)
--   check16_no_anon_execute        — no new SECURITY DEFINER function is anon-executable
--
-- NOTE on rule 4 (self-approval): the FIRST draft of this guard copied
-- hs_doc_guard()'s (123) "staff excepted" exemption verbatim, and
-- check3 caught that it was a complete no-op here — hs_documents is
-- staff-only end to end (RLS lets nobody else write it), so exempting
-- staff exempts EVERY possible writer. Fixed to a bare auth.uid()
-- comparison with no role exemption (the 155 self-authorisation
-- precedent), then re-proved refused live before trusting it.

BEGIN;

CREATE TEMP TABLE probe_out (line text);

DO $$
DECLARE
  r text[] := '{}';
  co uuid;
  author uuid := gen_random_uuid();
  reviewer uuid := gen_random_uuid();
  approver uuid := gen_random_uuid();
  v1 uuid; v2 uuid; v3 uuid; v4 uuid;
  emp uuid;
  ack_id uuid;
  hs_doc_ack uuid;
  ok boolean;
BEGIN
  SELECT id INTO co FROM public.companies LIMIT 1;
  IF co IS NULL THEN
    INSERT INTO public.companies (id, name) VALUES (gen_random_uuid(), 'Probe160 Co') RETURNING id INTO co;
  END IF;

  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES
    (author, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p160-author@probe.invalid', '', now(), now(), now(), '{}', '{}'),
    (reviewer, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p160-reviewer@probe.invalid', '', now(), now(), now(), '{}', '{}'),
    (approver, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p160-approver@probe.invalid', '', now(), now(), now(), '{}', '{}');
  UPDATE public.profiles SET role = 'tps_admin' WHERE id IN (author, reviewer, approver);

  INSERT INTO public.employee_records (company_id, full_name, email, status, job_title, start_date)
  VALUES (co, 'Probe160 Employee', 'p160-employee@probe.invalid', 'active', 'Probe Employee', current_date) RETURNING id INTO emp;

  -- Act as the author for the initial inserts/transitions.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', author, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  -- ── check2: approver = author refused at INSERT (data-level CHECK) ──
  ok := false;
  BEGIN
    INSERT INTO public.hs_documents (company_id, title, category, reviewer_id, approver_id)
    VALUES (co, 'Probe160 Doc (bad)', 'hs_policy_governance', reviewer, author);
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  r := array_append(r, format('check2_self_approval_refused_data: %s', ok));

  -- ── v1: a normal document, reviewer + approver named ────────────────
  INSERT INTO public.hs_documents (company_id, title, category, reviewer_id, approver_id, review_due_at)
  VALUES (co, 'Probe160 Doc', 'hs_policy_governance', reviewer, approver, current_date + 365)
  RETURNING id INTO v1;

  -- ── check5: draft -> pending_approval directly, reviewer named, refused ─
  ok := false;
  BEGIN
    UPDATE public.hs_documents SET status = 'pending_approval' WHERE id = v1;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  r := array_append(r, format('check5_review_bypass_refused: %s', ok));

  -- ── check1 (part 1): draft -> pending_review -> pending_approval ────
  UPDATE public.hs_documents SET status = 'pending_review' WHERE id = v1;
  ok := (SELECT status = 'pending_review' FROM public.hs_documents WHERE id = v1);
  UPDATE public.hs_documents SET status = 'pending_approval' WHERE id = v1;
  ok := ok AND (SELECT status = 'pending_approval' AND reviewed_at IS NOT NULL FROM public.hs_documents WHERE id = v1);

  -- ── check3: acting session = author, even though the NAMED approver
  --    is someone else — refused ──────────────────────────────────────
  BEGIN
    UPDATE public.hs_documents SET status = 'approved' WHERE id = v1;
    r := array_append(r, 'check3_self_approval_refused_session: false');
  EXCEPTION WHEN insufficient_privilege THEN
    r := array_append(r, 'check3_self_approval_refused_session: true');
  END;

  -- ── check4: a different staff approver succeeds ─────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', approver, 'role', 'authenticated')::text, true);
  BEGIN
    UPDATE public.hs_documents SET status = 'approved' WHERE id = v1;
    r := array_append(r, format('check4_staff_approval_allowed: %s',
      (SELECT status = 'approved' AND approved_at IS NOT NULL FROM public.hs_documents WHERE id = v1)));
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, format('check4_staff_approval_allowed: false (%s)', SQLERRM));
  END;

  -- approved -> active (no effective_from set: immediate)
  UPDATE public.hs_documents SET status = 'active' WHERE id = v1;
  ok := ok AND (SELECT status = 'active' FROM public.hs_documents WHERE id = v1);
  r := array_append(r, format('check1_full_lifecycle: %s', ok));

  -- ── check6: a document naming NO reviewer may skip straight to
  --    pending_approval, then approve/publish ─────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', author, 'role', 'authenticated')::text, true);
  INSERT INTO public.hs_documents (company_id, title, category, approver_id)
  VALUES (co, 'Probe160 Doc B', 'hs_policy_governance', approver) RETURNING id INTO v3;
  BEGIN
    UPDATE public.hs_documents SET status = 'pending_approval' WHERE id = v3;
    r := array_append(r, format('check6_review_bypass_ok_no_reviewer: %s', (SELECT status = 'pending_approval' FROM public.hs_documents WHERE id = v3)));
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, format('check6_review_bypass_ok_no_reviewer: false (%s)', SQLERRM));
  END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', approver, 'role', 'authenticated')::text, true);
  UPDATE public.hs_documents SET status = 'approved' WHERE id = v3;
  UPDATE public.hs_documents SET status = 'active' WHERE id = v3;

  -- ── check7/8: content immutable, administrative metadata movable ───
  PERFORM set_config('request.jwt.claims', json_build_object('sub', author, 'role', 'authenticated')::text, true);
  ok := false;
  BEGIN
    UPDATE public.hs_documents SET title = 'Changed title' WHERE id = v1;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  r := array_append(r, format('check7_content_immutable: %s', ok));

  BEGIN
    UPDATE public.hs_documents SET review_due_at = current_date + 400 WHERE id = v1;
    r := array_append(r, format('check8_admin_metadata_movable: %s', (SELECT review_due_at = current_date + 400 FROM public.hs_documents WHERE id = v1)));
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, format('check8_admin_metadata_movable: false (%s)', SQLERRM));
  END;

  -- ── check9/10: effective_from gate ────────────────────────────────
  INSERT INTO public.hs_documents (company_id, title, category, approver_id, effective_from)
  VALUES (co, 'Probe160 Doc Future', 'hs_policy_governance', approver, current_date + 30) RETURNING id INTO v4;
  UPDATE public.hs_documents SET status = 'pending_approval' WHERE id = v4;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', approver, 'role', 'authenticated')::text, true);
  UPDATE public.hs_documents SET status = 'approved' WHERE id = v4;
  ok := false;
  BEGIN
    UPDATE public.hs_documents SET status = 'active' WHERE id = v4;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  r := array_append(r, format('check9_effective_future_refused: %s', ok));

  UPDATE public.hs_documents SET effective_from = current_date - 1 WHERE id = v4;
  BEGIN
    UPDATE public.hs_documents SET status = 'active' WHERE id = v4;
    r := array_append(r, format('check10_effective_past_ok: %s', (SELECT status = 'active' FROM public.hs_documents WHERE id = v4)));
  EXCEPTION WHEN OTHERS THEN
    r := array_append(r, format('check10_effective_past_ok: false (%s)', SQLERRM));
  END;

  -- ── check11: supersede on publish, no continuity gap ────────────────
  -- v1 is 'active'. Create v2 (supersedes v1), draft only — v1 must
  -- STILL be active throughout v2's review. Publish v2 -> v1 flips.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', author, 'role', 'authenticated')::text, true);
  INSERT INTO public.hs_documents (company_id, title, category, version, supersedes_id, approver_id)
  VALUES (co, 'Probe160 Doc', 'hs_policy_governance', 2, v1, approver) RETURNING id INTO v2;
  ok := (SELECT status = 'active' FROM public.hs_documents WHERE id = v1); -- still active while v2 is draft
  UPDATE public.hs_documents SET status = 'pending_approval' WHERE id = v2;
  ok := ok AND (SELECT status = 'active' FROM public.hs_documents WHERE id = v1); -- still active mid-review
  PERFORM set_config('request.jwt.claims', json_build_object('sub', approver, 'role', 'authenticated')::text, true);
  UPDATE public.hs_documents SET status = 'approved' WHERE id = v2;
  UPDATE public.hs_documents SET status = 'active' WHERE id = v2;
  ok := ok
    AND (SELECT status = 'active' FROM public.hs_documents WHERE id = v2)
    AND (SELECT status = 'superseded' FROM public.hs_documents WHERE id = v1)
    AND (SELECT count(*) = 1 FROM public.hs_documents WHERE id = v1); -- v1 still SELECTable
  r := array_append(r, format('check11_supersede_on_publish: %s', ok));

  -- ── check12: acknowledgement pinned to a specific version's id ─────
  INSERT INTO public.policy_acknowledgements (company_id, hs_document_id, employee_id, status)
  VALUES (co, v1, emp, 'pending') RETURNING id INTO ack_id;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', author, 'role', 'authenticated')::text, true);
  INSERT INTO public.hs_documents (company_id, title, category, version, supersedes_id, approver_id)
  VALUES (co, 'Probe160 Doc', 'hs_policy_governance', 3, v2, approver) RETURNING id INTO hs_doc_ack;
  UPDATE public.hs_documents SET status = 'pending_approval' WHERE id = hs_doc_ack;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', approver, 'role', 'authenticated')::text, true);
  UPDATE public.hs_documents SET status = 'approved' WHERE id = hs_doc_ack;
  UPDATE public.hs_documents SET status = 'active' WHERE id = hs_doc_ack; -- v3 supersedes v2 now, v1 untouched
  r := array_append(r, format('check12_ack_pinned_to_version: %s',
    (SELECT hs_document_id = v1 FROM public.policy_acknowledgements WHERE id = ack_id)));

  -- ── check13: an impossible jump is refused ──────────────────────────
  PERFORM set_config('request.jwt.claims', json_build_object('sub', author, 'role', 'authenticated')::text, true);
  INSERT INTO public.hs_documents (company_id, title, category)
  VALUES (co, 'Probe160 Doc Bad Jump', 'hs_policy_governance') RETURNING id INTO v3;
  ok := false;
  BEGIN
    UPDATE public.hs_documents SET status = 'superseded' WHERE id = v3;
  EXCEPTION WHEN check_violation THEN ok := true;
  END;
  r := array_append(r, format('check13_bad_transition_refused: %s', ok));

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);

  r := array_append(r, format('check14_rls_enabled: %s', (SELECT relrowsecurity FROM pg_class WHERE relname = 'hs_documents')));
  r := array_append(r, format('check15_no_delete_grant: %s', NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'hs_documents'
      AND grantee IN ('anon', 'authenticated') AND privilege_type = 'DELETE'
  )));
  r := array_append(r, format('check16_no_anon_execute: %s', NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname IN ('hs_document_lifecycle_guard', 'hs_document_supersede_roll', 'hs_document_event')
      AND has_function_privilege('anon', oid, 'EXECUTE')
  )));

  INSERT INTO probe_out SELECT unnest(r);
END $$;

SELECT * FROM probe_out ORDER BY line;

ROLLBACK;
