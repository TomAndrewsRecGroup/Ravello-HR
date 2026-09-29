-- Rolled-back live probe for migration 166 (environmental_aspects_supersede_roll).
-- Run inside BEGIN;...ROLLBACK; — never commit.
--
-- Reproduces, then disproves, a defensive gap found during Phase 5
-- Group 10 adversarial QA (the same class as 165's emergency_plans
-- fix): environmental_aspects had no automated supersede, so an
-- INSERT naming a supersedes_id with no separate follow-up UPDATE
-- left both rows non-superseded indefinitely. No current admin UI
-- path exercises this yet (EnvironmentalAspectsClient.tsx has no "new
-- version" action) — this is closed proactively, in the database,
-- ahead of any UI wiring it.

BEGIN;
CREATE TEMP TABLE probe_out (k text, v text);

DO $$
DECLARE
  v_company uuid;
  v_a1 uuid;
  v_a2 uuid;
  v_a3 uuid;
  v_sib_a uuid;
  v_sib_b uuid;
  v_count int;
BEGIN
  SELECT id INTO v_company FROM companies LIMIT 1;

  -- Check 1: the bug scenario — insert v2 naming v1, no manual UPDATE.
  INSERT INTO environmental_aspects (company_id, activity, aspect_type, condition, status)
  VALUES (v_company, 'Probe activity v1', 'emissions_to_air', 'normal', 'assessed')
  RETURNING id INTO v_a1;

  INSERT INTO environmental_aspects (company_id, activity, aspect_type, condition, status, supersedes_id)
  VALUES (v_company, 'Probe activity v2', 'emissions_to_air', 'normal', 'draft', v_a1)
  RETURNING id INTO v_a2;

  SELECT count(*) INTO v_count FROM environmental_aspects
  WHERE id IN (v_a1, v_a2) AND status <> 'superseded';
  INSERT INTO probe_out VALUES ('check1_only_v2_current_expect_1', v_count::text);

  -- Check 2: sibling race — two versions both naming v2 as their parent.
  INSERT INTO environmental_aspects (company_id, activity, aspect_type, condition, status, supersedes_id)
  VALUES (v_company, 'Probe activity v3a', 'emissions_to_air', 'normal', 'draft', v_a2)
  RETURNING id INTO v_sib_a;

  INSERT INTO environmental_aspects (company_id, activity, aspect_type, condition, status, supersedes_id)
  VALUES (v_company, 'Probe activity v3b', 'emissions_to_air', 'normal', 'draft', v_a2)
  RETURNING id INTO v_sib_b;

  SELECT count(*) INTO v_count FROM environmental_aspects
  WHERE id IN (v_sib_a, v_sib_b) AND status <> 'superseded';
  INSERT INTO probe_out VALUES ('check2_sibling_race_only_one_current_expect_1', v_count::text);

  -- Check 3: a plain first insert (no supersedes_id) is unaffected.
  INSERT INTO environmental_aspects (company_id, activity, aspect_type, condition, status)
  VALUES (v_company, 'Probe standalone activity', 'noise', 'normal', 'draft')
  RETURNING id INTO v_a3;
  INSERT INTO probe_out SELECT 'check3_standalone_insert_status_expect_draft', status FROM environmental_aspects WHERE id = v_a3;
END $$;

SELECT * FROM probe_out ORDER BY k;
ROLLBACK;
