-- Rolled-back live probe for migration 165 (emergency_plans_supersede_roll).
-- Run inside BEGIN;...ROLLBACK; — never commit.
--
-- Reproduces, then disproves, the gap found during Phase 5 Group 10
-- adversarial QA: emergency_plans had NO automated supersede at all,
-- so a version created without its own manual "supersede the parent"
-- follow-up write (a dropped connection, a crash, a different write
-- path) left two 'active' rows in the same lineage permanently.

BEGIN;
CREATE TEMP TABLE probe_out (k text, v text);

DO $$
DECLARE
  v_company uuid;
  v_plan1 uuid;
  v_plan2 uuid;
  v_plan3 uuid;
  v_sib_a uuid;
  v_sib_b uuid;
  v_active_count int;
  v_sib_active_count int;
BEGIN
  SELECT id INTO v_company FROM companies LIMIT 1;

  -- Check 1: the exact bug scenario — insert v2 naming v1, with NO
  -- separate UPDATE superseding v1 at all.
  INSERT INTO emergency_plans (company_id, plan_type, title, version, status)
  VALUES (v_company, 'fire', 'Probe fire plan v1', 1, 'active')
  RETURNING id INTO v_plan1;

  INSERT INTO emergency_plans (company_id, plan_type, title, version, status, supersedes_id)
  VALUES (v_company, 'fire', 'Probe fire plan v2', 2, 'active', v_plan1)
  RETURNING id INTO v_plan2;

  SELECT count(*) INTO v_active_count FROM emergency_plans
  WHERE id IN (v_plan1, v_plan2) AND status = 'active';
  INSERT INTO probe_out VALUES ('check1_auto_supersede_no_manual_update_expect_1', v_active_count::text);

  -- Check 2: a normal linear chain is unaffected — v3 supersedes v2.
  INSERT INTO emergency_plans (company_id, plan_type, title, version, status, supersedes_id)
  VALUES (v_company, 'fire', 'Probe fire plan v3', 3, 'active', v_plan2)
  RETURNING id INTO v_plan3;

  INSERT INTO probe_out SELECT 'check2_v1_status_expect_superseded', status FROM emergency_plans WHERE id = v_plan1;
  INSERT INTO probe_out SELECT 'check2_v2_status_expect_superseded', status FROM emergency_plans WHERE id = v_plan2;
  INSERT INTO probe_out SELECT 'check2_v3_status_expect_active', status FROM emergency_plans WHERE id = v_plan3;

  -- Check 3: a genuine sibling race — two versions both naming v3 as
  -- their parent, both inserted as active.
  INSERT INTO emergency_plans (company_id, plan_type, title, version, status, supersedes_id)
  VALUES (v_company, 'fire', 'Probe fire plan v4a', 4, 'active', v_plan3)
  RETURNING id INTO v_sib_a;

  INSERT INTO emergency_plans (company_id, plan_type, title, version, status, supersedes_id)
  VALUES (v_company, 'fire', 'Probe fire plan v4b', 4, 'active', v_plan3)
  RETURNING id INTO v_sib_b;

  SELECT count(*) INTO v_sib_active_count FROM emergency_plans
  WHERE id IN (v_sib_a, v_sib_b) AND status = 'active';
  INSERT INTO probe_out VALUES ('check3_sibling_race_only_one_active_expect_1', v_sib_active_count::text);
END $$;

SELECT * FROM probe_out ORDER BY k;
ROLLBACK;
