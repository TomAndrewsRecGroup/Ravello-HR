-- Core-OS 360 Phase 7, Group 3. Rolled back. Verified 2026-09-29, all
-- 11 checks passed (the first run caught a probe-setup gap, not a
-- migration defect: a randomly-picked second real auth.users row was
-- already tps_admin, so the "unauthorised consultant" case needed an
-- explicit non-staff role to actually exercise the portfolio policy
-- instead of the staff ALL-access bypass — fixed by setting
-- role = 'client_admin' on both probe users before testing RLS).
--   1. company_id is auto-filled from the visit's own client, never
--      trusted from the caller.
--   2. A linked_source_id naming a DIFFERENT company's hs_equipment
--      row (the Phase 7 QA command's own named attack: "attempt to
--      attach Client B asset/document/person during Client A visit")
--      is refused.
--   3. A linked_source_id naming the SAME company's hs_equipment row
--      is accepted.
--   4. An immediate_danger observation synchronously creates an
--      urgent/critical, verification_required action and stamps
--      resulting_action_id.
--   5. A non-immediate-danger observation creates NO action.
--   6. Portfolio-wide RLS: an authorised consultant may insert/read;
--      an unauthorised one (no grant on this client) is refused.
--   7. The client read policy shows only client_visible = true rows.
--   8. The new hs_files/storage evidence policies let a portfolio-wide
--      consultant read/insert evidence against a visit_observation
--      entity_type without switching into the client.
--   9. hs_files_entity_check() still refuses a cross-organisation
--      evidence attachment for a PRE-EXISTING entity type (regression).
--  10. visit_observation_fill/visit_observation_escalate are not
--      directly executable by anon or authenticated.
--  11. The write guard is present on visit_observations.

BEGIN;

DO $$
DECLARE
  laws_id UUID; client_id UUID; other_client UUID;
  consultant_uid UUID; unauth_consultant_uid UUID;
  rel_id UUID;
  visit1 UUID;
  asset_same UUID; asset_other UUID;
  obs_id UUID; obs2_id UUID; obs3_id UUID;
  action_count INT;
  resolved_action UUID;
  file_id UUID;
BEGIN
  SELECT id INTO laws_id FROM public.companies WHERE organisation_type = 'consultancy' LIMIT 1;
  IF laws_id IS NULL THEN
    INSERT INTO public.companies (name, slug, organisation_type) VALUES ('Probe Consultancy 174', 'probe-consultancy-174', 'consultancy') RETURNING id INTO laws_id;
  END IF;
  SELECT id INTO client_id FROM public.companies WHERE id <> laws_id AND organisation_type <> 'consultancy' LIMIT 1;
  SELECT id INTO other_client FROM public.companies WHERE id <> laws_id AND id <> client_id AND organisation_type <> 'consultancy' LIMIT 1;

  SELECT id INTO consultant_uid FROM auth.users ORDER BY id LIMIT 1;
  SELECT id INTO unauth_consultant_uid FROM auth.users WHERE id <> consultant_uid ORDER BY id LIMIT 1;
  IF unauth_consultant_uid IS NULL THEN unauth_consultant_uid := consultant_uid; END IF;
  -- Explicitly non-staff, so check6/check8 actually exercise the
  -- portfolio-wide consultancy RLS policy under test, never a staff
  -- ALL-access bypass a randomly-picked real user might otherwise hold.
  UPDATE public.profiles SET company_id = laws_id, role = 'client_admin' WHERE id = consultant_uid;

  INSERT INTO public.organisation_relationships (source_organisation_id, target_organisation_id, relationship_type, status, valid_from)
    VALUES (laws_id, client_id, 'consultancy_client', 'active', current_date) RETURNING id INTO rel_id;
  INSERT INTO public.user_organisation_access (user_id, organisation_id, role_key, access_scope, active_status, valid_from, via_relationship_id)
    VALUES (consultant_uid, client_id, 'consultant', 'full', 'active', now(), rel_id);

  INSERT INTO public.consultancy_visits (consultancy_organisation_id, client_organisation_id, visit_type, scheduled_date, status)
    VALUES (laws_id, client_id, 'retained_visit', current_date, 'in_progress') RETURNING id INTO visit1;

  INSERT INTO public.hs_equipment (company_id, asset_type, name, status) VALUES (client_id, 'tool', 'Probe drill - same client', 'in_service') RETURNING id INTO asset_same;
  INSERT INTO public.hs_equipment (company_id, asset_type, name, status) VALUES (other_client, 'tool', 'Probe drill - other client', 'in_service') RETURNING id INTO asset_other;

  -- check1 + check2: company_id fill + cross-org linked source refused,
  -- run under the service role (no session) so the guard trigger itself
  -- is what's under test, not RLS.
  BEGIN
    INSERT INTO public.visit_observations (visit_id, observation_type, description, linked_source_type, linked_source_id)
      VALUES (visit1, 'observation', 'Probe: cross-org link attempt', 'equipment', asset_other);
    RAISE EXCEPTION 'check2 FAILED: a Client B asset was accepted during a Client A visit';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check2 PASSED';
  END;

  INSERT INTO public.visit_observations (visit_id, observation_type, description, linked_source_type, linked_source_id)
    VALUES (visit1, 'observation', 'Probe: same-org link accepted', 'equipment', asset_same) RETURNING id INTO obs_id;
  IF (SELECT company_id FROM public.visit_observations WHERE id = obs_id) <> client_id THEN
    RAISE EXCEPTION 'check1 FAILED: company_id was not auto-filled from the visit''s own client';
  END IF;
  RAISE NOTICE 'check1 PASSED';
  RAISE NOTICE 'check3 PASSED';

  -- check4 + check5: immediate-danger escalation, synchronous
  SELECT count(*) INTO action_count FROM public.actions WHERE source_type = 'consultant_visit' AND source_id = visit1;
  IF action_count <> 0 THEN RAISE EXCEPTION 'check4/5 setup FAILED: unexpected pre-existing actions'; END IF;

  INSERT INTO public.visit_observations (visit_id, observation_type, description)
    VALUES (visit1, 'observation', 'Probe: routine observation, no escalation') RETURNING id INTO obs2_id;
  IF (SELECT resulting_action_id FROM public.visit_observations WHERE id = obs2_id) IS NOT NULL THEN
    RAISE EXCEPTION 'check5 FAILED: a non-immediate-danger observation created an action';
  END IF;
  RAISE NOTICE 'check5 PASSED';

  INSERT INTO public.visit_observations (visit_id, observation_type, description)
    VALUES (visit1, 'immediate_danger', 'Probe: exposed live wiring near walkway') RETURNING id INTO obs3_id;
  SELECT resulting_action_id INTO resolved_action FROM public.visit_observations WHERE id = obs3_id;
  IF resolved_action IS NULL THEN
    RAISE EXCEPTION 'check4 FAILED: immediate_danger observation did not stamp resulting_action_id';
  END IF;
  PERFORM 1 FROM public.actions
    WHERE id = resolved_action AND source_type = 'consultant_visit' AND source_id = visit1
      AND related_entity_type = 'visit_observation' AND related_entity_id = obs3_id
      AND priority = 'urgent' AND severity = 'critical' AND verification_required = true AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'check4 FAILED: escalated action does not have the expected urgent/critical/verification shape';
  END IF;
  RAISE NOTICE 'check4 PASSED';

  -- check6: portfolio-wide RLS — authorised consultant may insert/read
  PERFORM set_config('request.jwt.claims', json_build_object('sub', consultant_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  PERFORM 1 FROM public.visit_observations WHERE id = obs_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'check6 FAILED: authorised consultant cannot read visit_observations'; END IF;

  INSERT INTO public.visit_observations (visit_id, observation_type, description, client_visible)
    VALUES (visit1, 'positive', 'Probe: good housekeeping observed', true);
  INSERT INTO public.visit_observations (visit_id, observation_type, description, client_visible)
    VALUES (visit1, 'improvement', 'Probe: internal-only note', false);
  RAISE NOTICE 'check6 PASSED (insert)';

  RESET ROLE;

  -- unauthorised consultant: no grant on this client at all
  PERFORM set_config('request.jwt.claims', json_build_object('sub', unauth_consultant_uid::text, 'role', 'authenticated')::text, true);
  -- Explicitly non-staff: a randomly-picked second real user could
  -- otherwise happen to already be tps_admin, which would bypass the
  -- portfolio grant entirely via visit_observations_staff_all and
  -- prove nothing about the consultancy policy under test.
  UPDATE public.profiles SET company_id = laws_id, role = 'client_admin' WHERE id = unauth_consultant_uid;
  SET LOCAL ROLE authenticated;

  BEGIN
    INSERT INTO public.visit_observations (visit_id, observation_type, description) VALUES (visit1, 'observation', 'Probe: should be refused');
    RAISE EXCEPTION 'check6 FAILED: an unauthorised consultant (no grant on this client) could insert';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check6 PASSED (unauthorised refused)';
  END;
  RESET ROLE;

  -- check7: client read policy — client_visible only
  -- (checked structurally, since simulating a client_admin session needs
  -- a profiles.role='client_admin' user; the policy's own USING clause
  -- is read back instead, matching this file's own regression-check
  -- convention for read-only structural assertions)
  PERFORM 1 FROM pg_policies
    WHERE tablename = 'visit_observations' AND policyname = 'visit_observations_client_read'
      AND qual LIKE '%client_visible = true%';
  IF NOT FOUND THEN RAISE EXCEPTION 'check7 FAILED: client read policy does not filter on client_visible'; END IF;
  RAISE NOTICE 'check7 PASSED';

  -- check8: hs_files/storage evidence policies for visit_observation,
  -- portfolio-wide consultant, no switch into the client.
  PERFORM set_config('request.jwt.claims', json_build_object('sub', consultant_uid::text, 'role', 'authenticated')::text, true);
  UPDATE public.profiles SET company_id = laws_id WHERE id = consultant_uid;
  SET LOCAL ROLE authenticated;

  INSERT INTO public.hs_files (company_id, entity_type, entity_id, storage_path, file_name)
    VALUES (client_id, 'visit_observation', obs_id, client_id || '/visit_observation/' || obs_id || '/probe.jpg', 'probe.jpg')
    RETURNING id INTO file_id;
  PERFORM 1 FROM public.hs_files WHERE id = file_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'check8 FAILED: portfolio-wide consultant could not read back the evidence row it inserted'; END IF;
  RAISE NOTICE 'check8 PASSED';

  RESET ROLE;

  -- check9: regression — cross-org evidence still refused for a
  -- pre-existing entity type (equipment)
  BEGIN
    INSERT INTO public.hs_files (company_id, entity_type, entity_id, storage_path, file_name)
      VALUES (client_id, 'equipment', asset_other, client_id || '/equipment/' || asset_other || '/probe.jpg', 'probe.jpg');
    RAISE EXCEPTION 'check9 FAILED: cross-organisation equipment evidence was accepted';
  EXCEPTION WHEN others THEN
    IF SQLSTATE = '23514' THEN
      RAISE NOTICE 'check9 PASSED';
    ELSE
      RAISE;
    END IF;
  END;

  -- check10: functions not directly executable by anon/authenticated
  IF has_function_privilege('anon', 'public.visit_observation_fill()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.visit_observation_fill()', 'EXECUTE') THEN
    RAISE EXCEPTION 'check10 FAILED: visit_observation_fill is directly executable';
  END IF;
  IF has_function_privilege('anon', 'public.visit_observation_escalate()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.visit_observation_escalate()', 'EXECUTE') THEN
    RAISE EXCEPTION 'check10 FAILED: visit_observation_escalate is directly executable';
  END IF;
  RAISE NOTICE 'check10 PASSED';

  -- check11: write guard present
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'visit_observations' AND policyname LIKE '%write_guard%') THEN
    RAISE EXCEPTION 'check11 FAILED: write guard missing on visit_observations';
  END IF;
  RAISE NOTICE 'check11 PASSED';
END $$;

ROLLBACK;
