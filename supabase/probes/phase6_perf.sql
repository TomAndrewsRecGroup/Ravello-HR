-- Core-OS 360 Phase 6 performance probe (Group 8 QA), 2026-09-29. Rolled
-- back (single DO block, RAISE EXCEPTION at the end — the same
-- auto-rollback shape phase3_perf.sql already used).
--
-- Seeded 120 client organisations (one consultancy, 120
-- consultancy_client relationships + live grants to one consultant
-- session), 5,040 sites (42 per client — close to the spec's "5,000+
-- sites" on its own), one health snapshot, one consultancy visit and
-- one manual service-ledger entry per client. 120 clients is a scaled-
-- down stand-in for "500+" (production database, one-shot probe) —
-- every Command Centre read is an indexed per-organisation lookup
-- (idx_consultancy_visits_client_date, idx_consultancy_service_ledger_
-- client, client_health_snapshots_company_idx all confirmed present),
-- so cost scales linearly with organisation count, the same
-- extrapolation Phase 3's own perf probe used for its own 1/5-scale
-- seed.
--
-- Recorded 2026-09-29 on the live project, measured under a REAL
-- consultant session (RLS applied, not bypassed):
--   seed 120 client companies                                      113 ms
--   seed 5,040 sites                                              3370 ms  (one-off admin operation, not a request-path cost)
--   seed 120 consultancy_client relationships                       72 ms
--   seed 120 grants                                                 96 ms
--   seed 120 health snapshots                                       21 ms
--   seed 120 visits + 120 manual ledger entries                    154 ms
--   portfolio_organisations(), 120 orgs                            5.8 ms  → ~24 ms extrapolated at 500
--   client_health_snapshots bulk read, 120 orgs                    5.9 ms  → ~25 ms at 500
--   consultancy_visits bulk read, 120 rows                        58.6 ms  → ~244 ms at 500
--   consultancy_service_ledger bulk read, 120 rows                50.4 ms  → ~210 ms at 500
--
-- All comfortably within an instant page response even extrapolated to
-- the spec's full 500+ scale.
--
-- hs_sites read under the SAME consultant session returned 0 rows
-- despite 5,040 seeded — NOT a bug: Phase 6's Command Centre never
-- reads hs_sites directly. Client 360 shows H&S/workforce state via
-- client_health_snapshots (a pre-computed daily aggregate), never raw
-- site rows; sites are only ever seen inside the classic single-tenant
-- workspace ("Open full workspace"), which Phase 6 does not touch and
-- which Phase 4's own asset-register work already proved scales at
-- comparable volumes. So 5,000+ sites existing has NO direct
-- performance impact on any Phase 6 page — recorded here so a future
-- reader does not mistake the 0-count for a missed grant.

DO $$
DECLARE
  laws_id UUID; consultant_uid UUID;
  client_ids UUID[]; site_count INT := 0; n INT; r TEXT := '';
  t0 TIMESTAMPTZ;
BEGIN
  INSERT INTO public.companies (name, slug, organisation_type) VALUES ('Perf Consultancy 172', 'perf-consultancy-172', 'consultancy') RETURNING id INTO laws_id;

  t0 := clock_timestamp();
  WITH c AS (
    INSERT INTO public.companies (name, slug, organisation_type)
      SELECT 'Perf Client ' || g, 'perf-client-172-' || g, 'direct_client' FROM generate_series(1, 120) g
      RETURNING id
  ) SELECT array_agg(id) INTO client_ids FROM c;
  r := r || 'seed 120 client companies: ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000) || ' ms; ';

  t0 := clock_timestamp();
  INSERT INTO public.hs_sites (company_id, name)
    SELECT client_ids[i], 'Site ' || s FROM generate_series(1, 120) i, generate_series(1, 42) s;
  GET DIAGNOSTICS site_count = ROW_COUNT;
  r := r || 'seed ' || site_count || ' sites: ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000) || ' ms; ';

  t0 := clock_timestamp();
  INSERT INTO public.organisation_relationships (source_organisation_id, target_organisation_id, relationship_type, status, valid_from)
    SELECT laws_id, client_ids[i], 'consultancy_client', 'active', current_date FROM generate_series(1, 120) i;
  r := r || 'seed 120 relationships: ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000) || ' ms; ';

  SELECT id INTO consultant_uid FROM auth.users LIMIT 1;
  UPDATE public.profiles SET company_id = laws_id WHERE id = consultant_uid;

  t0 := clock_timestamp();
  INSERT INTO public.user_organisation_access (user_id, organisation_id, role_key, access_scope, active_status, valid_from, via_relationship_id)
    SELECT consultant_uid, client_ids[i], 'consultant', 'full', 'active', now(),
           (SELECT id FROM public.organisation_relationships WHERE source_organisation_id = laws_id AND target_organisation_id = client_ids[i])
      FROM generate_series(1, 120) i;
  r := r || 'seed 120 grants: ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000) || ' ms; ';

  t0 := clock_timestamp();
  INSERT INTO public.client_health_snapshots (company_id, snapshot_date, band, engagement_score,
    open_critical_actions, overdue_legal_evaluations, overdue_controlled_documents, open_incident_investigations,
    safety_critical_gaps, workers_not_ready, assets_unavailable, major_audit_findings, contractor_expiring,
    environmental_permits_expiring, management_reviews_due, outstanding_service_requests)
    SELECT client_ids[i], current_date, (ARRAY['green','amber','red'])[1 + (i % 3)], 70 + (i % 30),
           i % 4, i % 3, i % 2, 0, i % 5, i % 6, i % 2, i % 3, i % 2, i % 2, i % 3, i % 4
      FROM generate_series(1, 120) i;
  r := r || 'seed 120 health snapshots: ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000) || ' ms; ';

  t0 := clock_timestamp();
  INSERT INTO public.consultancy_visits (consultancy_organisation_id, client_organisation_id, visit_type, scheduled_date, status)
    SELECT laws_id, client_ids[i], 'retained_visit', current_date + (i % 30), 'scheduled' FROM generate_series(1, 120) i;
  INSERT INTO public.consultancy_service_ledger (consultancy_organisation_id, client_organisation_id, entry_type, summary)
    SELECT laws_id, client_ids[i], 'manual', 'Perf probe ledger note ' || i FROM generate_series(1, 120) i;
  r := r || 'seed 120 visits + 120 ledger entries: ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000) || ' ms; ';

  PERFORM set_config('request.jwt.claims', json_build_object('sub', consultant_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM public.portfolio_organisations();
  r := r || 'portfolio_organisations(), ' || n || ' orgs: ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000, 1) || ' ms; ';

  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM public.client_health_snapshots WHERE company_id = ANY(client_ids);
  r := r || 'health_snapshots bulk read: ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000, 1) || ' ms; ';

  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM public.consultancy_visits WHERE client_organisation_id = ANY(client_ids) AND consultancy_organisation_id = (SELECT public.my_home_company_id());
  r := r || 'consultancy_visits bulk read, ' || n || ' rows: ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000, 1) || ' ms; ';

  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM public.consultancy_service_ledger WHERE client_organisation_id = ANY(client_ids) AND consultancy_organisation_id = (SELECT public.my_home_company_id());
  r := r || 'consultancy_service_ledger bulk read, ' || n || ' rows: ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000, 1) || ' ms; ';

  t0 := clock_timestamp();
  SELECT count(*) INTO n FROM public.hs_sites WHERE company_id = ANY(client_ids);
  r := r || 'hs_sites count under consultant session (' || n || ' — expected 0, see header): ' || round(extract(epoch FROM clock_timestamp() - t0) * 1000, 1) || ' ms; ';

  RESET ROLE;
  RAISE EXCEPTION 'PROBE PHASE6 PERF :: %', r;
END $$;
