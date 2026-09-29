-- Live rolled-back probe for migration 156 (environmental aspects &
-- impacts). Run via execute_sql; the final RAISE EXCEPTION rolls
-- everything back — nothing here persists.
--
-- Checks, PASS/FAIL style, printed via RAISE NOTICE and asserted with
-- IF ... THEN RAISE EXCEPTION so a failure aborts the block with a
-- clear message naming which check failed.

DO $$
DECLARE
  co_a uuid; co_b uuid;
  site_a uuid; site_wrong_org uuid;
  aspect1 uuid; aspect2 uuid;
  assess1 uuid;
  v_status text;
  v_score int;
  ok boolean;
  n int;
BEGIN
  -- Two companies to prove cross-organisation isolation.
  INSERT INTO companies (name, slug) VALUES ('Probe156 Co A', 'probe156-a') RETURNING id INTO co_a;
  INSERT INTO companies (name, slug) VALUES ('Probe156 Co B', 'probe156-b') RETURNING id INTO co_b;
  INSERT INTO hs_sites (company_id, name) VALUES (co_a, 'Site A') RETURNING id INTO site_a;
  INSERT INTO hs_sites (company_id, name) VALUES (co_b, 'Site B') RETURNING id INTO site_wrong_org;

  ------------------------------------------------------------------
  -- 1. Cross-organisation site is refused.
  ------------------------------------------------------------------
  BEGIN
    INSERT INTO environmental_aspects (company_id, site_id, activity, aspect_type)
    VALUES (co_a, site_wrong_org, 'Cross-org site test', 'other');
    RAISE EXCEPTION 'CHECK 1 FAILED: cross-organisation site was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'CHECK 1 FAILED%' THEN RAISE; END IF;
    RAISE NOTICE 'CHECK 1 PASS: cross-organisation site refused (%)', SQLERRM;
  END;

  ------------------------------------------------------------------
  -- 2. A same-org aspect inserts cleanly, status defaults to draft.
  ------------------------------------------------------------------
  INSERT INTO environmental_aspects (company_id, site_id, activity, aspect_type, condition, description)
  VALUES (co_a, site_a, 'Diesel generator run during power cuts', 'emissions_to_air', 'abnormal', 'Backup generator, ~4hrs/yr')
  RETURNING id, status INTO aspect1, v_status;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'CHECK 2 FAILED: expected draft status, got %', v_status; END IF;
  RAISE NOTICE 'CHECK 2 PASS: aspect created, status=draft';

  ------------------------------------------------------------------
  -- 3. Evidence vocab resolves for environmental_aspect.
  ------------------------------------------------------------------
  IF hs_scope_for_entity('environmental_aspect') IS DISTINCT FROM 'register' THEN
    RAISE EXCEPTION 'CHECK 3 FAILED: hs_scope_for_entity(environmental_aspect) wrong';
  END IF;
  IF hs_entity_table('environmental_aspect') IS DISTINCT FROM 'environmental_aspects' THEN
    RAISE EXCEPTION 'CHECK 3b FAILED: hs_entity_table(environmental_aspect) wrong';
  END IF;
  RAISE NOTICE 'CHECK 3 PASS: evidence vocab resolves';

  ------------------------------------------------------------------
  -- 4. An assessment with no confirmation is refused — the
  --    significance-confirmation gate cannot be bypassed even by a
  --    caller who tries to insert is_significant directly.
  ------------------------------------------------------------------
  BEGIN
    INSERT INTO environmental_aspect_assessments
      (aspect_id, likelihood, severity, frequency, significance_threshold_used, is_significant)
    VALUES (aspect1, 4, 4, 3, 45, true);
    RAISE EXCEPTION 'CHECK 4 FAILED: unconfirmed significant assessment was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'CHECK 4 FAILED%' THEN RAISE; END IF;
    RAISE NOTICE 'CHECK 4 PASS: unconfirmed assessment refused (%)', SQLERRM;
  END;

  -- Also refused when is_significant = false (the gate is about being
  -- a DECISION at all, not about which way it points).
  BEGIN
    INSERT INTO environmental_aspect_assessments
      (aspect_id, likelihood, severity, frequency, significance_threshold_used, is_significant)
    VALUES (aspect1, 1, 1, 1, 45, false);
    RAISE EXCEPTION 'CHECK 4c FAILED: unconfirmed non-significant assessment was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'CHECK 4c FAILED%' THEN RAISE; END IF;
    RAISE NOTICE 'CHECK 4c PASS: unconfirmed assessment refused regardless of polarity';
  END;

  ------------------------------------------------------------------
  -- 5. A CONFIRMED assessment is accepted, computed_score is
  --    deterministic (likelihood x severity x frequency, never a
  --    black-box value), and the aspect's status rolls to
  --    confirmed_significant.
  ------------------------------------------------------------------
  INSERT INTO environmental_aspect_assessments
    (aspect_id, likelihood, severity, frequency, significance_threshold_used, is_significant, confirmed_by, confirmed_at, methodology_notes)
  VALUES (aspect1, 4, 4, 3, 45, true, (SELECT id FROM auth.users LIMIT 1), now(), 'Likelihood x severity x frequency, threshold 45')
  RETURNING id, computed_score INTO assess1, v_score;
  IF v_score <> 48 THEN RAISE EXCEPTION 'CHECK 5 FAILED: computed_score expected 48 (4*4*3), got %', v_score; END IF;
  SELECT status INTO v_status FROM environmental_aspects WHERE id = aspect1;
  IF v_status <> 'confirmed_significant' THEN
    RAISE EXCEPTION 'CHECK 5b FAILED: aspect status expected confirmed_significant, got %', v_status;
  END IF;
  RAISE NOTICE 'CHECK 5 PASS: confirmed assessment accepted, score=48, aspect rolled to confirmed_significant';

  ------------------------------------------------------------------
  -- 6. Assessment table is insert-only: UPDATE/DELETE from a session
  --    role are refused by REVOKE (checked via privilege, since this
  --    probe runs as the migration/service role which still holds
  --    ownership rights — the property under test is the GRANT state,
  --    not a live 42501 from this call).
  ------------------------------------------------------------------
  SELECT NOT (has_table_privilege('authenticated', 'environmental_aspect_assessments', 'UPDATE')
              OR has_table_privilege('authenticated', 'environmental_aspect_assessments', 'DELETE'))
    INTO ok;
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 6 FAILED: authenticated still holds UPDATE/DELETE on assessments'; END IF;
  RAISE NOTICE 'CHECK 6 PASS: assessments insert-only (no UPDATE/DELETE grant to authenticated)';

  ------------------------------------------------------------------
  -- 7. Versioning: a material change creates a NEW ROW, never a
  --    silent overwrite. Old row flips to superseded and both rows
  --    remain individually readable.
  ------------------------------------------------------------------
  INSERT INTO environmental_aspects (company_id, site_id, activity, aspect_type, condition, description, version, supersedes_id)
  VALUES (co_a, site_a, 'Diesel generator run during power cuts (revised fuel type)', 'emissions_to_air', 'abnormal', 'Switched to HVO fuel', 2, aspect1)
  RETURNING id INTO aspect2;
  UPDATE environmental_aspects SET status = 'superseded' WHERE id = aspect1;
  SELECT count(*) INTO n FROM environmental_aspects WHERE id IN (aspect1, aspect2);
  IF n <> 2 THEN RAISE EXCEPTION 'CHECK 7 FAILED: expected both old and new version rows to exist, found %', n; END IF;
  SELECT status INTO v_status FROM environmental_aspects WHERE id = aspect1;
  IF v_status <> 'superseded' THEN RAISE EXCEPTION 'CHECK 7b FAILED: old version status expected superseded, got %', v_status; END IF;
  SELECT status INTO v_status FROM environmental_aspects WHERE id = aspect2;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'CHECK 7c FAILED: new version should start fresh (draft), got %', v_status; END IF;
  RAISE NOTICE 'CHECK 7 PASS: versioning creates a new row, old row superseded, both readable';

  ------------------------------------------------------------------
  -- 8. Cross-organisation supersedes_id is refused.
  ------------------------------------------------------------------
  BEGIN
    INSERT INTO environmental_aspects (company_id, site_id, activity, aspect_type, supersedes_id)
    VALUES (co_b, NULL, 'Wrong-org supersede test', 'other', aspect1);
    RAISE EXCEPTION 'CHECK 8 FAILED: cross-organisation supersedes_id was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'CHECK 8 FAILED%' THEN RAISE; END IF;
    RAISE NOTICE 'CHECK 8 PASS: cross-organisation supersedes_id refused (%)', SQLERRM;
  END;

  ------------------------------------------------------------------
  -- 9. actions.source_type CHECK now allows 'environmental_aspect'
  --    (rule 1: never a second action table).
  ------------------------------------------------------------------
  PERFORM 1 FROM pg_get_constraintdef(
    (SELECT oid FROM pg_constraint WHERE conname = 'actions_source_type_check')
  ) AS def WHERE def LIKE '%environmental_aspect%';
  IF NOT FOUND THEN RAISE EXCEPTION 'CHECK 9 FAILED: actions_source_type_check does not allow environmental_aspect'; END IF;
  RAISE NOTICE 'CHECK 9 PASS: actions.source_type allows environmental_aspect';

  ------------------------------------------------------------------
  -- 10. The write guard blocks a read-only consultancy grant — proven
  --     by confirming apply_write_guard's restrictive policies exist
  --     on both new tables (the same check every Phase 4 group's own
  --     probe uses: the mechanism is generic and already proven
  --     live; this confirms it was actually APPLIED here).
  ------------------------------------------------------------------
  PERFORM 1 FROM pg_policies WHERE tablename = 'environmental_aspects' AND policyname = 'write_guard_ins';
  IF NOT FOUND THEN RAISE EXCEPTION 'CHECK 10 FAILED: write_guard_ins missing on environmental_aspects'; END IF;
  PERFORM 1 FROM pg_policies WHERE tablename = 'environmental_aspect_assessments' AND policyname = 'write_guard_ins';
  IF NOT FOUND THEN RAISE EXCEPTION 'CHECK 10b FAILED: write_guard_ins missing on environmental_aspect_assessments'; END IF;
  RAISE NOTICE 'CHECK 10 PASS: write guard applied to both tables';

  ------------------------------------------------------------------
  -- 11. Capabilities seeded and granted (environmental.read/manage).
  ------------------------------------------------------------------
  PERFORM 1 FROM access_capabilities WHERE key = 'environmental.read';
  IF NOT FOUND THEN RAISE EXCEPTION 'CHECK 11 FAILED: environmental.read capability missing'; END IF;
  PERFORM 1 FROM access_capabilities WHERE key = 'environmental.manage';
  IF NOT FOUND THEN RAISE EXCEPTION 'CHECK 11b FAILED: environmental.manage capability missing'; END IF;
  PERFORM 1 FROM access_role_capabilities WHERE capability_key = 'environmental.manage' AND role_key = 'organisation_admin';
  IF NOT FOUND THEN RAISE EXCEPTION 'CHECK 11c FAILED: organisation_admin missing environmental.manage'; END IF;
  RAISE NOTICE 'CHECK 11 PASS: capabilities seeded and granted';

  ------------------------------------------------------------------
  -- 12. RLS is enabled on both new tables.
  ------------------------------------------------------------------
  SELECT relrowsecurity INTO ok FROM pg_class WHERE relname = 'environmental_aspects';
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 12 FAILED: RLS not enabled on environmental_aspects'; END IF;
  SELECT relrowsecurity INTO ok FROM pg_class WHERE relname = 'environmental_aspect_assessments';
  IF NOT ok THEN RAISE EXCEPTION 'CHECK 12b FAILED: RLS not enabled on environmental_aspect_assessments'; END IF;
  RAISE NOTICE 'CHECK 12 PASS: RLS enabled on both tables';

  ------------------------------------------------------------------
  -- 13. No SECURITY DEFINER function created here is executable by
  --     anon or PUBLIC.
  ------------------------------------------------------------------
  IF has_function_privilege('anon', 'public.environmental_aspect_assessments_fill()', 'execute')
     OR has_function_privilege('anon', 'public.environmental_aspect_assessments_roll()', 'execute')
     OR has_function_privilege('anon', 'public.environmental_aspects_stamp()', 'execute')
     OR has_function_privilege('anon', 'public.environmental_aspects_event()', 'execute') THEN
    RAISE EXCEPTION 'CHECK 13 FAILED: a Group 1 DEFINER function is executable by anon';
  END IF;
  RAISE NOTICE 'CHECK 13 PASS: no Group 1 DEFINER function executable by anon';

  RAISE NOTICE '=== 156_environmental_aspects probe: 15/15 checks passed ===';

  RAISE EXCEPTION 'PROBE 156_environmental_aspects (rolled back): all checks above passed; this exception rolls back every write this probe made — nothing persists.';
END $$;
