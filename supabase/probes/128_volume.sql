-- Phase 2 volume probe (2026-09-28): the spec's QA load — 10k hazards,
-- 20k risk items (1,000 assessments × 20), 5k incidents, 50k actions,
-- 10k evidence rows — for ONE fixture organisation, inserted through
-- every real trigger (guards, audit, timeline, outbox), then the pages'
-- actual queries timed AS A SIGNED-IN USER so RLS is in the cost.
-- One transaction; RAISE at the end rolls everything back.
--
-- The MCP SQL runner stops at 60 s, and every insert runs its real
-- triggers (row guards, audit, timeline, outbox), so the full volume
-- cannot load in one call. `k` scales every volume; the handover records
-- the runs at each k, and query plans are checked separately for index
-- use. Triggers are never suspended: this role may not, and a probe must
-- not take ALTER TABLE locks on production tables.
-- Recorded 2026-09-28 (all triggers live, timed as the org's admin with RLS):
--  k=0.10: inserts 1k hazards 2.2s · 100 RA+2k items 3.0s · 500 incidents 2.5s · 5k actions 7.1s · 1k evidence 1.1s;
--          hazard list(500) 80ms · incident list 35ms · open actions 32ms · RA items 28ms · evidence 7ms ·
--          overview 197ms · analysis 123ms · search 545ms COLD (448ms of it is first-call planning, measured on
--          live data with no fixtures: 448 → 106 → 17 ms on calls 1-3).
--  → migration 129 added trigram indexes on the searched titles.
--  k=0.25: inserts 2.5k hazards 3.6s · 250 RA+5k items 6.1s · 1.25k incidents 1.7s · 12.5k actions 17.2s ·
--          2.5k evidence 2.2s; hazard list(500) 7ms · count 4ms · incident list 5ms · open actions 4ms ·
--          RA items 20ms · evidence 7ms · overview 115ms · analysis 150ms · search title 60ms · search number 59ms.
--  The spec's full volume (k=1) cannot load inside the 60 s runner through every trigger; at 2.5x the load the
--  list queries did not grow (index-backed, LIMIT 500) and the aggregate functions grew sub-linearly.

DO $$
DECLARE
  x uuid := gen_random_uuid(); adm uuid := gen_random_uuid(); site uuid; mx uuid;
  t0 timestamptz; r text := ''; n int; j jsonb;
  k numeric := 0.1;  -- scale: 1 = the spec's full QA volume (see header)
BEGIN
  PERFORM set_config('statement_timeout', '0', true);
  INSERT INTO companies (id, name, slug, organisation_type, active) VALUES (x, 'Probe Volume Ltd', 'probe-vol-'||left(x::text,8), 'direct_client', true);
  INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  VALUES (adm, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'p128-adm@probe.invalid', '', now(), now(), now(), '{}', '{}');
  UPDATE profiles SET role = 'client_admin', company_id = x WHERE id = adm;
  INSERT INTO hs_sites (company_id, name, site_type) VALUES (x, 'Volume Plant', 'factory') RETURNING id INTO site;
  SELECT id INTO mx FROM risk_matrices WHERE company_id IS NULL AND is_default;

  t0 := clock_timestamp();
  INSERT INTO hazards (company_id, title, site_id, status, perceived_seriousness, identified_at)
  SELECT x, 'Volume hazard ' || g, site, (ARRAY['identified','under_assessment','controlled','monitoring','closed'])[1 + g % 5],
         (ARRAY['low','medium','high','very_high'])[1 + g % 4], now() - (g % 365) * interval '1 day'
    FROM generate_series(1, (10000 * k)::int) g;
  r := r || 'insert ' || (10000 * k)::int || ' hazards ' || round(extract(epoch FROM clock_timestamp() - t0)::numeric, 1) || 's; ';

  t0 := clock_timestamp();
  INSERT INTO risk_assessments (company_id, title, risk_matrix_id, site_id)
  SELECT x, 'Volume RA ' || g, mx, site FROM generate_series(1, (1000 * k)::int) g;
  INSERT INTO risk_assessment_items (company_id, risk_assessment_id, hazard_description, likelihood_before, severity_before, likelihood_after, severity_after)
  SELECT x, ra.id, 'Item ' || g, 1 + g % 5, 1 + (g / 5) % 5, 1 + g % 5, LEAST(1 + (g / 5) % 5, 1 + g % 3)
    FROM risk_assessments ra, generate_series(1, 20) g WHERE ra.company_id = x;
  UPDATE risk_assessments SET status = 'pending_review', review_date = current_date + 180 WHERE company_id = x;
  UPDATE risk_assessments SET status = 'approved', approved_by = adm, approved_at = now(), review_date = current_date + 180
   WHERE company_id = x;
  r := r || 'insert ' || (1000 * k)::int || ' RA + ' || (20000 * k)::int || ' items ' || round(extract(epoch FROM clock_timestamp() - t0)::numeric, 1) || 's; ';

  t0 := clock_timestamp();
  INSERT INTO hs_incidents (company_id, incident_type, title, occurred_on, description, site_id, exact_location)
  SELECT x, (ARRAY['near_miss','injury','accident','property_damage','dangerous_occurrence'])[1 + g % 5], 'Volume incident ' || g,
         current_date - (g % 365), 'Volume description', site, 'Line ' || (g % 12)
    FROM generate_series(1, (5000 * k)::int) g;
  r := r || 'insert ' || (5000 * k)::int || ' incidents ' || round(extract(epoch FROM clock_timestamp() - t0)::numeric, 1) || 's; ';

  t0 := clock_timestamp();
  INSERT INTO actions (company_id, action_type, title, priority, status, source_type, source_id, site_id, due_date, action_class)
  SELECT x, 'hs_corrective', 'Volume action ' || g, (ARRAY['low','normal','high','urgent'])[1 + g % 4],
         (ARRAY['active','in_progress','complete','active','complete'])[1 + g % 5], 'hazard', hz.a[1 + g % (10000 * k)::int], site,
         current_date + (g % 120) - 60, 'corrective'
    FROM generate_series(1, (50000 * k)::int) g,
         (SELECT array_agg(id) a FROM hazards WHERE company_id = x) hz;
  r := r || 'insert ' || (50000 * k)::int || ' actions ' || round(extract(epoch FROM clock_timestamp() - t0)::numeric, 1) || 's; ';

  t0 := clock_timestamp();
  INSERT INTO hs_files (company_id, entity_type, entity_id, storage_path, file_name, mime_type, size_bytes, evidence_type)
  SELECT x, 'hazard', h.id, x::text || '/hazard/' || h.id::text || '/' || gen_random_uuid()::text || '-photo.jpg', 'photo.jpg', 'image/jpeg', 120000, 'photo'
    FROM hazards h WHERE h.company_id = x;
  r := r || 'insert ' || (10000 * k)::int || ' evidence ' || round(extract(epoch FROM clock_timestamp() - t0)::numeric, 1) || 's; ';

  ANALYZE hazards; ANALYZE risk_assessments; ANALYZE risk_assessment_items; ANALYZE hs_incidents; ANALYZE actions; ANALYZE hs_files;

  -- ── the pages' queries, as the organisation's admin (RLS on) ──
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role','authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM (SELECT id, reference, title, status FROM hazards WHERE company_id = x AND status <> 'archived' ORDER BY identified_at DESC LIMIT 500) s;
  r := r || 'hazard list(500) ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000) || 'ms; ';
  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM hazards WHERE company_id = x AND status <> 'archived';
  r := r || 'hazard count(' || n || ') ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000) || 'ms; ';
  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM (SELECT id FROM hs_incidents WHERE company_id = x ORDER BY occurred_on DESC LIMIT 500) s;
  r := r || 'incident list(500) ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000) || 'ms; ';
  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM (SELECT id FROM actions WHERE company_id = x AND status IN ('active','in_progress','awaiting_verification') ORDER BY due_date LIMIT 500) s;
  r := r || 'open actions(500) ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000) || 'ms; ';
  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM (SELECT i.id FROM risk_assessment_items i WHERE i.risk_assessment_id = (SELECT id FROM risk_assessments WHERE company_id = x LIMIT 1)) s;
  r := r || 'one RA items(' || n || ') ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000) || 'ms; ';
  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM hs_files WHERE entity_type = 'hazard' AND entity_id = (SELECT id FROM hazards WHERE company_id = x LIMIT 1);
  r := r || 'one hazard evidence ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000) || 'ms; ';
  t0 := clock_timestamp();
  j := hs_safety_overview();
  r := r || 'overview ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000) || 'ms (open_hazards=' || (j->>'open_hazards') || ', high_residual=' || (j->>'high_residual_risks') || ', overdue_actions=' || (j->>'overdue_actions') || '); ';
  t0 := clock_timestamp();
  j := hs_safety_breakdowns();
  r := r || 'analysis ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000) || 'ms (actions raised=' || (j->'actions'->>'raised') || '); ';
  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM search_records('Volume hazard 777', 30);
  r := r || 'search title ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000) || 'ms (' || n || '); ';
  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM search_records('INC-2026-0004', 30);
  r := r || 'search number ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000) || 'ms (' || n || '); ';
  RESET ROLE;

  RAISE EXCEPTION 'PROBE 128 VOLUME k=% (rolled back): %', k, r;
END $$;
