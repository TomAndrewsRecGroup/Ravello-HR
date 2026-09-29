-- Live probe for migration 161 (Core-OS 360 Phase 5, Group 6: Objectives
-- & Targets, and Management Review). Run inside BEGIN/ROLLBACK against
-- project sbmekaviwkiyorvmtgcu — never applied for real.
--
--   check1_rls_enabled                    — RLS is ON for all six new tables
--   check2_write_guard_present            — write_guard_ins/upd/del present
--                                            on the five client-readable tables
--   check3_cross_org_owner_refused        — an objective naming another
--                                            company's person as owner is refused
--   check4_objective_inserts_draft        — a plain objective insert works,
--                                            defaults to status = 'draft'
--   check5_measurement_insert_only        — objective_measurements has no
--                                            UPDATE/DELETE grant to authenticated
--   check6_roll_achieved                  — a measurement reaching the target
--                                            rolls the objective to 'achieved'
--   check7_roll_at_risk_near_deadline     — a measurement short of target with
--                                            a near deadline rolls to 'at_risk'
--   check8_roll_skips_abandoned           — a measurement never overrides a
--                                            human 'abandoned' decision
--   check9_roll_newest_wins               — a late-backfilled OLDER measurement
--                                            never moves status backwards
--   check10_measurement_company_derived   — company_id always comes from the
--                                            parent objective, never the caller
--   check11_actions_source_type_present   — actions_source_type_check allows
--                                            'objective' and 'management_review'
--   check12_review_completed_at_stamped   — completed_at is stamped the moment
--                                            status reaches 'completed', once
--   check13_cross_org_chair_refused       — a review naming another company's
--                                            person as chair is refused
--   check14_attendee_cross_org_refused    — an attendee from another company
--                                            is refused
--   check15_decision_insert_ok            — a decision inserts while the
--                                            review is not completed
--   check16_decision_refused_once_completed — a decision cannot be inserted
--                                            once the review is 'completed'
--   check17_decision_immutable            — no UPDATE/DELETE grant to
--                                            authenticated on decisions
--   check18_data_pack_insert_only         — no UPDATE/DELETE grant to
--                                            authenticated on the data pack
--   check19_data_pack_snapshot_stable     — inserting a new measurement after
--                                            a pack was generated does not
--                                            change the stored snapshot
--   check20_no_anon_execute               — no new SECURITY DEFINER function
--                                            is anon-executable
--   check21_resulting_action_cross_org_refused — a decision naming another
--                                            company's action is refused

BEGIN;

CREATE TEMP TABLE results (check_name text, pass boolean) ON COMMIT DROP;

DO $$
DECLARE v_co uuid; v_co2 uuid;
BEGIN
  SELECT id INTO v_co FROM public.companies LIMIT 1;
  IF v_co IS NULL THEN
    INSERT INTO public.companies (id, name) VALUES (gen_random_uuid(), 'Probe Co') RETURNING id INTO v_co;
  END IF;
  SELECT id INTO v_co2 FROM public.companies WHERE id <> v_co LIMIT 1;
  IF v_co2 IS NULL THEN
    INSERT INTO public.companies (id, name) VALUES (gen_random_uuid(), 'Probe Co 2') RETURNING id INTO v_co2;
  END IF;
  CREATE TEMP TABLE probe_ctx (pco uuid, pco2 uuid) ON COMMIT DROP;
  INSERT INTO probe_ctx VALUES (v_co, v_co2);
END $$;

-- Ensure each probe company has at least one `people` row to link to.
DO $$
DECLARE v_co uuid; v_co2 uuid;
BEGIN
  SELECT pco, pco2 INTO v_co, v_co2 FROM probe_ctx;
  IF NOT EXISTS (SELECT 1 FROM public.people WHERE company_id = v_co) THEN
    INSERT INTO public.people (company_id, full_name, worker_type, lifecycle_status) VALUES (v_co, 'Probe Person A', 'employee', 'active');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.people WHERE company_id = v_co2) THEN
    INSERT INTO public.people (company_id, full_name, worker_type, lifecycle_status) VALUES (v_co2, 'Probe Person B', 'employee', 'active');
  END IF;
END $$;

INSERT INTO results SELECT 'check1_rls_enabled', bool_and(relrowsecurity)
FROM pg_class WHERE relname IN (
  'objectives','objective_measurements','management_reviews',
  'management_review_attendees','management_review_data_pack','management_review_decisions'
);

INSERT INTO results SELECT 'check2_write_guard_present', bool_and(cnt = 3) FROM (
  SELECT tablename, count(*) cnt FROM pg_policies
  WHERE schemaname = 'public' AND tablename IN (
    'objectives','objective_measurements','management_reviews',
    'management_review_attendees','management_review_decisions')
    AND policyname IN ('write_guard_ins','write_guard_upd','write_guard_del')
  GROUP BY tablename
) x;

DO $$
DECLARE v_co uuid; v_co2 uuid; v_person_other uuid; v_failed boolean := false;
BEGIN
  SELECT pco, pco2 INTO v_co, v_co2 FROM probe_ctx;
  SELECT id INTO v_person_other FROM public.people WHERE company_id = v_co2 LIMIT 1;
  BEGIN
    INSERT INTO public.objectives (company_id, title, owner_person_id) VALUES (v_co, 'Cross-org owner test', v_person_other);
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('check3_cross_org_owner_refused', v_failed);
END $$;

DO $$
DECLARE v_co uuid; v_obj_id uuid; v_ok boolean := false;
BEGIN
  SELECT pco INTO v_co FROM probe_ctx;
  INSERT INTO public.objectives (company_id, title) VALUES (v_co, 'Reduce lost-time incidents') RETURNING id INTO v_obj_id;
  SELECT (status = 'draft') INTO v_ok FROM public.objectives WHERE id = v_obj_id;
  INSERT INTO results VALUES ('check4_objective_inserts_draft', v_ok);
END $$;

INSERT INTO results SELECT 'check5_measurement_insert_only', NOT EXISTS (
  SELECT 1 FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND table_name = 'objective_measurements'
    AND grantee = 'authenticated' AND privilege_type IN ('UPDATE','DELETE')
);

DO $$
DECLARE v_co uuid; v_obj_id uuid; v_ok boolean := false;
BEGIN
  SELECT pco INTO v_co FROM probe_ctx;
  INSERT INTO public.objectives (company_id, title, target_value, target_direction, target_date, status)
    VALUES (v_co, 'Zero RIDDOR incidents this year', 0, 'decrease', current_date + 200, 'active') RETURNING id INTO v_obj_id;
  INSERT INTO public.objective_measurements (objective_id, value) VALUES (v_obj_id, 0);
  SELECT (status = 'achieved') INTO v_ok FROM public.objectives WHERE id = v_obj_id;
  INSERT INTO results VALUES ('check6_roll_achieved', v_ok);
END $$;

DO $$
DECLARE v_co uuid; v_obj_id uuid; v_ok boolean := false;
BEGIN
  SELECT pco INTO v_co FROM probe_ctx;
  INSERT INTO public.objectives (company_id, title, target_value, target_direction, target_date, status)
    VALUES (v_co, 'Increase training completion to 95%', 95, 'increase', current_date + 10, 'active') RETURNING id INTO v_obj_id;
  INSERT INTO public.objective_measurements (objective_id, value) VALUES (v_obj_id, 60);
  SELECT (status = 'at_risk') INTO v_ok FROM public.objectives WHERE id = v_obj_id;
  INSERT INTO results VALUES ('check7_roll_at_risk_near_deadline', v_ok);
END $$;

DO $$
DECLARE v_co uuid; v_obj_id uuid; v_ok boolean := false;
BEGIN
  SELECT pco INTO v_co FROM probe_ctx;
  INSERT INTO public.objectives (company_id, title, target_value, target_direction, target_date, status)
    VALUES (v_co, 'Abandoned objective', 100, 'increase', current_date + 5, 'abandoned') RETURNING id INTO v_obj_id;
  INSERT INTO public.objective_measurements (objective_id, value) VALUES (v_obj_id, 10);
  SELECT (status = 'abandoned') INTO v_ok FROM public.objectives WHERE id = v_obj_id;
  INSERT INTO results VALUES ('check8_roll_skips_abandoned', v_ok);
END $$;

DO $$
DECLARE v_co uuid; v_obj_id uuid; v_status_after_first text; v_status_after_backfill text; v_ok boolean;
BEGIN
  SELECT pco INTO v_co FROM probe_ctx;
  INSERT INTO public.objectives (company_id, title, target_value, target_direction, target_date, status)
    VALUES (v_co, 'Roll newest-wins test', 100, 'increase', current_date + 200, 'active') RETURNING id INTO v_obj_id;
  -- First (newest so far) measurement: reaches target -> achieved.
  INSERT INTO public.objective_measurements (objective_id, value, measured_at) VALUES (v_obj_id, 100, now());
  SELECT status INTO v_status_after_first FROM public.objectives WHERE id = v_obj_id;
  -- Backfill an OLDER measurement (measured_at in the past), far short of target.
  INSERT INTO public.objective_measurements (objective_id, value, measured_at) VALUES (v_obj_id, 5, now() - interval '30 days');
  SELECT status INTO v_status_after_backfill FROM public.objectives WHERE id = v_obj_id;
  v_ok := (v_status_after_first = 'achieved') AND (v_status_after_backfill = 'achieved');
  INSERT INTO results VALUES ('check9_roll_newest_wins', v_ok);
END $$;

DO $$
DECLARE v_co uuid; v_co2 uuid; v_req uuid; v_obj_id uuid; v_m_id uuid; v_ok boolean;
BEGIN
  SELECT pco, pco2 INTO v_co, v_co2 FROM probe_ctx;
  INSERT INTO public.objectives (company_id, title) VALUES (v_co2, 'Company-derivation test') RETURNING id INTO v_obj_id;
  INSERT INTO public.objective_measurements (objective_id, value) VALUES (v_obj_id, 1) RETURNING id INTO v_m_id;
  SELECT (company_id = v_co2) INTO v_ok FROM public.objective_measurements WHERE id = v_m_id;
  INSERT INTO results VALUES ('check10_measurement_company_derived', v_ok);
END $$;

INSERT INTO results SELECT 'check11_actions_source_type_present', EXISTS (
  SELECT 1 FROM pg_constraint c
  WHERE c.conrelid = 'public.actions'::regclass AND c.conname = 'actions_source_type_check'
    AND pg_get_constraintdef(c.oid) LIKE '%objective%' AND pg_get_constraintdef(c.oid) LIKE '%management_review%'
);

DO $$
DECLARE v_co uuid; v_review_id uuid; v_ok boolean;
BEGIN
  SELECT pco INTO v_co FROM probe_ctx;
  INSERT INTO public.management_reviews (company_id, review_date, status) VALUES (v_co, current_date, 'scheduled') RETURNING id INTO v_review_id;
  UPDATE public.management_reviews SET status = 'in_progress' WHERE id = v_review_id;
  UPDATE public.management_reviews SET status = 'completed' WHERE id = v_review_id;
  SELECT (completed_at IS NOT NULL) INTO v_ok FROM public.management_reviews WHERE id = v_review_id;
  INSERT INTO results VALUES ('check12_review_completed_at_stamped', v_ok);
END $$;

DO $$
DECLARE v_co uuid; v_co2 uuid; v_person_other uuid; v_failed boolean := false;
BEGIN
  SELECT pco, pco2 INTO v_co, v_co2 FROM probe_ctx;
  SELECT id INTO v_person_other FROM public.people WHERE company_id = v_co2 LIMIT 1;
  BEGIN
    INSERT INTO public.management_reviews (company_id, review_date, chaired_by) VALUES (v_co, current_date, v_person_other);
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('check13_cross_org_chair_refused', v_failed);
END $$;

DO $$
DECLARE v_co uuid; v_co2 uuid; v_review_id uuid; v_person_other uuid; v_failed boolean := false;
BEGIN
  SELECT pco, pco2 INTO v_co, v_co2 FROM probe_ctx;
  INSERT INTO public.management_reviews (company_id, review_date) VALUES (v_co, current_date) RETURNING id INTO v_review_id;
  SELECT id INTO v_person_other FROM public.people WHERE company_id = v_co2 LIMIT 1;
  BEGIN
    INSERT INTO public.management_review_attendees (review_id, person_id) VALUES (v_review_id, v_person_other);
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('check14_attendee_cross_org_refused', v_failed);
END $$;

DO $$
DECLARE v_co uuid; v_review_id uuid; v_ok boolean := false;
BEGIN
  SELECT pco INTO v_co FROM probe_ctx;
  INSERT INTO public.management_reviews (company_id, review_date, status) VALUES (v_co, current_date, 'in_progress') RETURNING id INTO v_review_id;
  BEGIN
    INSERT INTO public.management_review_decisions (review_id, topic, decision_text)
      VALUES (v_review_id, 'Objectives review', 'Continue current objectives, revisit next quarter.');
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_ok := false;
  END;
  INSERT INTO results VALUES ('check15_decision_insert_ok', v_ok);
END $$;

DO $$
DECLARE v_co uuid; v_review_id uuid; v_failed boolean := false;
BEGIN
  SELECT pco INTO v_co FROM probe_ctx;
  INSERT INTO public.management_reviews (company_id, review_date, status) VALUES (v_co, current_date, 'completed') RETURNING id INTO v_review_id;
  BEGIN
    INSERT INTO public.management_review_decisions (review_id, topic, decision_text)
      VALUES (v_review_id, 'Late decision', 'This should be refused.');
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('check16_decision_refused_once_completed', v_failed);
END $$;

INSERT INTO results SELECT 'check17_decision_immutable', NOT EXISTS (
  SELECT 1 FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND table_name = 'management_review_decisions'
    AND grantee = 'authenticated' AND privilege_type IN ('UPDATE','DELETE')
);

INSERT INTO results SELECT 'check18_data_pack_insert_only', NOT EXISTS (
  SELECT 1 FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND table_name = 'management_review_data_pack'
    AND grantee = 'authenticated' AND privilege_type IN ('UPDATE','DELETE')
);

DO $$
DECLARE v_co uuid; v_review_id uuid; v_obj_id uuid; v_pack_id uuid; v_snapshot_before jsonb; v_snapshot_after jsonb; v_ok boolean;
BEGIN
  SELECT pco INTO v_co FROM probe_ctx;
  INSERT INTO public.management_reviews (company_id, review_date) VALUES (v_co, current_date) RETURNING id INTO v_review_id;
  INSERT INTO public.objectives (company_id, title, target_value, target_direction, target_date, status)
    VALUES (v_co, 'Pack snapshot test', 100, 'increase', current_date + 200, 'active') RETURNING id INTO v_obj_id;
  INSERT INTO public.objective_measurements (objective_id, value) VALUES (v_obj_id, 40);
  INSERT INTO public.management_review_data_pack (review_id, data)
    VALUES (v_review_id, jsonb_build_object('objectives_at_risk_or_missed', 0, 'generated_note', 'snapshot taken before further measurements'))
    RETURNING id INTO v_pack_id;
  SELECT data INTO v_snapshot_before FROM public.management_review_data_pack WHERE id = v_pack_id;
  -- Underlying data changes after the snapshot was taken.
  INSERT INTO public.objective_measurements (objective_id, value) VALUES (v_obj_id, 5);
  SELECT data INTO v_snapshot_after FROM public.management_review_data_pack WHERE id = v_pack_id;
  v_ok := (v_snapshot_before = v_snapshot_after);
  INSERT INTO results VALUES ('check19_data_pack_snapshot_stable', v_ok);
END $$;

INSERT INTO results SELECT 'check20_no_anon_execute', NOT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN (
    'objectives_stamp','objective_measurements_fill','objective_measurements_roll',
    'management_reviews_stamp','management_review_attendees_fill',
    'management_review_data_pack_fill','management_review_decisions_guard')
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
);

DO $$
DECLARE v_co uuid; v_co2 uuid; v_review_id uuid; v_action_other uuid; v_failed boolean := false;
BEGIN
  SELECT pco, pco2 INTO v_co, v_co2 FROM probe_ctx;
  INSERT INTO public.management_reviews (company_id, review_date) VALUES (v_co, current_date) RETURNING id INTO v_review_id;
  INSERT INTO public.actions (company_id, action_type, title, priority, status)
    VALUES (v_co2, 'manual', 'Other company action', 'normal', 'active') RETURNING id INTO v_action_other;
  BEGIN
    INSERT INTO public.management_review_decisions (review_id, topic, decision_text, resulting_action_id)
      VALUES (v_review_id, 'Cross-org action test', 'Should be refused', v_action_other);
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('check21_resulting_action_cross_org_refused', v_failed);
END $$;

SELECT * FROM results ORDER BY check_name;

ROLLBACK;
