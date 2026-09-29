-- Core-OS 360 Phase 7, Group 4. Rolled back. Verified 2026-09-29, all 6
-- checks passed (the first run caught a probe-construction flaw, not a
-- migration defect: request.jwt.claims is transaction-scoped and
-- survives RESET ROLE, so a stale claim from an earlier check leaked
-- into a later "as the system" bookkeeping write via auth.uid() —
-- fixed by explicitly clearing it before any such write).
--   1. A portfolio-wide consultant (no switch into the client) may
--      INSERT an action for a client they hold
--      consultancy.service_manage on, and read it back via RETURNING.
--   2. An unauthorised consultant (no grant on this client) is refused.
--   3. The consultant may move a client-completed, verification-
--      required action from awaiting_verification -> complete
--      (verify), acting as a genuinely different person from whoever
--      completed it.
--   4. "Nobody verifies their own work" still holds: the SAME session
--      cannot verify an action IT completed.
--   5. Reject/send-back (awaiting_verification -> in_progress) works
--      with a reason, and is refused without one.
--   6. RLS refuses an action for an unrelated, unauthorised company
--      entirely (no capability grant of any kind).

BEGIN;

DO $$
DECLARE
  laws_id UUID; client_id UUID; unrelated_client UUID;
  consultant_uid UUID; client_person_uid UUID; unauth_consultant_uid UUID;
  rel_id UUID;
  action1 UUID; action2 UUID;
BEGIN
  SELECT id INTO laws_id FROM public.companies WHERE organisation_type = 'consultancy' LIMIT 1;
  IF laws_id IS NULL THEN
    INSERT INTO public.companies (name, slug, organisation_type) VALUES ('Probe Consultancy 175', 'probe-consultancy-175', 'consultancy') RETURNING id INTO laws_id;
  END IF;
  SELECT id INTO client_id FROM public.companies WHERE id <> laws_id AND organisation_type <> 'consultancy' LIMIT 1;
  SELECT id INTO unrelated_client FROM public.companies WHERE id <> laws_id AND id <> client_id AND organisation_type <> 'consultancy' LIMIT 1;

  SELECT id INTO consultant_uid FROM auth.users ORDER BY id LIMIT 1;
  SELECT id INTO client_person_uid FROM auth.users WHERE id <> consultant_uid ORDER BY id LIMIT 1;
  SELECT id INTO unauth_consultant_uid FROM auth.users WHERE id NOT IN (consultant_uid, client_person_uid) ORDER BY id LIMIT 1;
  IF client_person_uid IS NULL THEN client_person_uid := consultant_uid; END IF;
  IF unauth_consultant_uid IS NULL THEN unauth_consultant_uid := consultant_uid; END IF;

  UPDATE public.profiles SET company_id = laws_id, role = 'client_admin' WHERE id = consultant_uid;
  UPDATE public.profiles SET company_id = laws_id, role = 'client_admin' WHERE id = unauth_consultant_uid;

  INSERT INTO public.organisation_relationships (source_organisation_id, target_organisation_id, relationship_type, status, valid_from)
    VALUES (laws_id, client_id, 'consultancy_client', 'active', current_date) RETURNING id INTO rel_id;
  INSERT INTO public.user_organisation_access (user_id, organisation_id, role_key, access_scope, active_status, valid_from, via_relationship_id)
    VALUES (consultant_uid, client_id, 'consultant', 'full', 'active', now(), rel_id);

  -- check1 + check2: authorised INSERT, RETURNING readable; unauthorised refused
  PERFORM set_config('request.jwt.claims', json_build_object('sub', consultant_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.actions (company_id, title, action_type, priority, status, source_type, source_id, related_entity_type, severity, verification_required)
    VALUES (client_id, 'Probe: guard missing on press brake', 'hs_check', 'high', 'active', 'consultant_visit', gen_random_uuid(), 'visit_observation', 'high', true)
    RETURNING id INTO action1;
  IF action1 IS NULL THEN RAISE EXCEPTION 'check1 FAILED: insert did not return an id (RETURNING blocked by RLS)'; END IF;
  RAISE NOTICE 'check1 PASSED';

  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', unauth_consultant_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.actions (company_id, title, action_type, priority, status)
      VALUES (client_id, 'Probe: should be refused', 'hs_check', 'normal', 'active');
    RAISE EXCEPTION 'check2 FAILED: an unauthorised consultant (no grant on this client) could insert';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check2 PASSED';
  END;
  RESET ROLE;
  -- request.jwt.claims is transaction-scoped (set_config's 3rd arg),
  -- so it survives RESET ROLE and would otherwise leak check2's
  -- unauth_consultant_uid into this "as the system" bookkeeping step —
  -- auth.uid() reads it regardless of which ROLE is active. Clear it
  -- explicitly before any write not meant to carry a session identity.
  PERFORM set_config('request.jwt.claims', '', true);

  -- Simulate the client's own person completing the action (service role — no session needed for this bookkeeping step)
  UPDATE public.actions SET status = 'awaiting_verification', completed_at = now(), completed_by = client_person_uid WHERE id = action1;

  -- check4: the SAME session cannot verify its own completed work
  PERFORM set_config('request.jwt.claims', json_build_object('sub', client_person_uid::text, 'role', 'authenticated')::text, true);
  UPDATE public.profiles SET company_id = laws_id, role = 'client_admin' WHERE id = client_person_uid;
  INSERT INTO public.user_organisation_access (user_id, organisation_id, role_key, access_scope, active_status, valid_from, via_relationship_id)
    VALUES (client_person_uid, client_id, 'consultant', 'full', 'active', now(), rel_id);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.actions SET status = 'complete' WHERE id = action1;
    RAISE EXCEPTION 'check4 FAILED: the person who completed the action could verify their own work';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check4 PASSED';
  END;
  RESET ROLE;

  -- check3: the CONSULTANT (a genuinely different person) may verify it
  PERFORM set_config('request.jwt.claims', json_build_object('sub', consultant_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.actions SET status = 'complete' WHERE id = action1;
  PERFORM 1 FROM public.actions WHERE id = action1 AND status = 'complete' AND verified_by = consultant_uid AND verified_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'check3 FAILED: the consultant could not verify a client-completed action'; END IF;
  RAISE NOTICE 'check3 PASSED';
  RESET ROLE;

  -- check5: reject/send-back needs a reason
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO public.actions (company_id, title, action_type, priority, status, verification_required)
    VALUES (client_id, 'Probe: second action for reject path', 'hs_check', 'normal', 'active', true) RETURNING id INTO action2;
  UPDATE public.actions SET status = 'awaiting_verification', completed_at = now(), completed_by = client_person_uid WHERE id = action2;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', consultant_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.actions SET status = 'in_progress' WHERE id = action2;
    RAISE EXCEPTION 'check5 FAILED: reject/send-back succeeded with no reason';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'check5a PASSED';
  END;
  UPDATE public.actions SET status = 'in_progress', verification_rejection_reason = 'Guard still missing on re-inspection' WHERE id = action2;
  PERFORM 1 FROM public.actions WHERE id = action2 AND status = 'in_progress' AND verification_rejected_by = consultant_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'check5 FAILED: reject/send-back with a reason did not apply'; END IF;
  RAISE NOTICE 'check5b PASSED';
  RESET ROLE;

  -- check6: an unrelated company is entirely refused (no grant at all, not even for a client the consultant DOES serve)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', consultant_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    INSERT INTO public.actions (company_id, title, action_type, priority, status)
      VALUES (unrelated_client, 'Probe: unrelated client, should be refused', 'hs_check', 'normal', 'active');
    RAISE EXCEPTION 'check6 FAILED: an action was inserted for a company with no consultancy relationship at all';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check6 PASSED';
  END;
  RESET ROLE;
END $$;

ROLLBACK;
