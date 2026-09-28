-- Core-OS 360 Phase 3 performance probe (QA 37), 2026-09-28. Rolled back.
-- Measured on the live project at 1/5 of the spec's volume (2,000 workers,
-- 100 roles with 5 rules each, 20,000 training records, 10,000
-- competency assessments, 2,000 person requirements), then extrapolated:
-- the engine's cost is per person (indexed lookups by person_id), so it
-- scales linearly with the number of people calculated.
-- Timings: live calculation per person, the cron sweep (cache fill), the
-- readiness list and matrix with a warm cache, one profile read.
--
-- Recorded 2026-09-28 on the live project:
--   load (2,000 workers, 20k training, 10k competency, 2k rules, all triggers)  28.7 s
--   live Safe to Deploy per person                                          5.96 ms
--     → 10,000 people with NO cache ≈ 60 s (the cold-start / mass-change case)
--   workforce_refresh_due(2000) (cron sweep)                                6.6 s
--     → 3.3 ms a person; the cron now takes 5,000 a run (~17 s)
--   workforce_readiness, warm cache, 2,000 people                           444 ms  (→ ~2.2 s at 10k)
--   workforce_matrix, warm cache, 2,000 people                              384 ms  (→ ~1.9 s at 10k)
--   one person profile (status + training + competencies)                   10 ms
--   expiring-in-30-days scan over 20k training records                      1.2 ms
-- Limitation (handover L): a rule change that dirties thousands of people
-- makes the list pages calculate them live until the next cron run.

DO $$
DECLARE a uuid := gen_random_uuid(); t date := public.workforce_today(); t0 timestamptz; r text := '';
  n int; roles uuid[]; courses uuid[]; comps uuid[]; lvl uuid; ppl uuid[]; ms numeric;
BEGIN
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES (a, 'PERF A', 'perf-' || left(a::text, 8), 'direct_client', true);
  SELECT id INTO lvl FROM competency_levels WHERE company_id IS NULL AND key = 'competent';
  WITH x AS (INSERT INTO job_roles (company_id, title, safety_critical)
             SELECT a, 'Role ' || g, g % 3 = 0 FROM generate_series(1, 100) g RETURNING id) SELECT array_agg(id) INTO roles FROM x;
  WITH x AS (INSERT INTO training_courses (company_id, title, validity_months)
             SELECT a, 'Course ' || g, 12 + (g % 3) * 12 FROM generate_series(1, 200) g RETURNING id) SELECT array_agg(id) INTO courses FROM x;
  WITH x AS (INSERT INTO competencies (company_id, title) SELECT a, 'Competency ' || g FROM generate_series(1, 100) g RETURNING id)
    SELECT array_agg(id) INTO comps FROM x;
  -- 5 rules per role: 3 training, 2 competency
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, effective_from)
    SELECT a, roles[i], 'training', courses[((i * 3 + k) % 200) + 1], current_date FROM generate_series(1, 100) i, generate_series(0, 2) k;
  INSERT INTO role_requirements (company_id, role_id, requirement_type, reference_id, min_level_id, effective_from)
    SELECT a, roles[i], 'competency', comps[((i * 2 + k) % 100) + 1], lvl, current_date FROM generate_series(1, 100) i, generate_series(0, 1) k;

  t0 := clock_timestamp();
  WITH x AS (INSERT INTO people (company_id, full_name, worker_type, lifecycle_status)
             SELECT a, 'Worker ' || g, 'employee', 'active' FROM generate_series(1, 2000) g RETURNING id) SELECT array_agg(id) INTO ppl FROM x;
  INSERT INTO role_assignments (company_id, person_id, role_id, primary_assignment, start_date)
    SELECT a, ppl[g], roles[(g % 100) + 1], true, t - 30 FROM generate_series(1, 2000) g;
  -- 10 training records per person (their role's 3 courses among them), 5 competency assessments
  INSERT INTO training_records (company_id, person_id, course_id, course_name, completed_on, result, verification_status, verified_at)
    SELECT a, ppl[g], courses[((((g % 100) + 1) * 3 + k) % 200) + 1], 'c', t - (k * 30), 'pass', 'verified', now()
      FROM generate_series(1, 2000) g, generate_series(0, 9) k;
  INSERT INTO person_competencies (company_id, person_id, competency_id, level_id, assessment_method, assessed_on, verification_status, verified_at)
    SELECT a, ppl[g], comps[((((g % 100) + 1) * 2 + k) % 100) + 1], lvl, 'practical_observation', t - k, 'verified', now()
      FROM generate_series(1, 2000) g, generate_series(0, 4) k;
  INSERT INTO person_requirements (company_id, person_id, requirement_type, reference_id, effective_from)
    SELECT a, ppl[g], 'training', courses[(g % 200) + 1], current_date FROM generate_series(1, 2000) g;
  r := r || 'load 2,000 workers + 20k training + 10k competency + 2k person rules: '
         || round(extract(epoch FROM clock_timestamp() - t0) * 1000) || ' ms; ';

  -- Live calculation, 200 people
  t0 := clock_timestamp();
  PERFORM public._wf_deployment(ppl[g], t) FROM generate_series(1, 200) g;
  ms := extract(epoch FROM clock_timestamp() - t0) * 1000 / 200;
  r := r || 'live Safe to Deploy per person: ' || round(ms, 2) || ' ms (10k people cold ≈ ' || round(ms * 10000 / 1000, 1) || ' s); ';

  -- The cron sweep fills the cache for everyone
  t0 := clock_timestamp();
  n := public.workforce_refresh_due(2000);
  r := r || 'refresh_due(2000) filled ' || n || ' in ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000) || ' ms; ';

  -- Warm cache reads (as staff; person_visible short-circuits on is_tps_staff, so this measures the loop)
  PERFORM set_config('request.jwt.claims', json_build_object('sub', (SELECT id FROM profiles WHERE role = 'tps_admin' LIMIT 1), 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM public.workforce_readiness(a);
  r := r || 'readiness list, warm cache, ' || n || ' people: ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000) || ' ms; ';
  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM public.workforce_matrix(a);
  r := r || 'matrix, warm cache, ' || n || ' people: ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000) || ' ms; ';
  t0 := clock_timestamp();
  PERFORM public.person_deployment_status(ppl[7]);
  PERFORM count(*) FROM training_records WHERE person_id = ppl[7];
  PERFORM count(*) FROM person_competencies WHERE person_id = ppl[7];
  r := r || 'one profile (status + training + competencies): ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000, 1) || ' ms; ';
  RESET ROLE;

  -- Expiry dashboard query shape: evidence expiring within 30 days, org-wide
  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM training_records WHERE company_id = a AND expires_on BETWEEN t AND t + 30;
  r := r || 'expiring-in-30-days scan: ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000, 1) || ' ms; ';

  RAISE EXCEPTION 'PROBE PHASE3 PERF :: %', r;
END $$;
