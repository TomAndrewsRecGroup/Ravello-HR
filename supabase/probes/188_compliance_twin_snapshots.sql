-- Core-OS 360 Completion Programme, Phase 23, Group 4. Rolled back.
-- Proves: a staff session can insert/upsert; a client (non-staff)
-- session can neither read nor write; the UNIQUE(company_id,
-- snapshot_date) upserts rather than duplicating on a same-day
-- re-save; RLS is enabled; no write guard needed (staff-only, no
-- client policy to protect); the audit trigger fires.

BEGIN;

DO $$
DECLARE
  client_a UUID; staff_uid UUID; client_uid UUID;
  snap_id UUID; seen INT;
BEGIN
  INSERT INTO public.companies (name, slug) VALUES ('Probe Twin Snap Client A', 'probe-twin-snap-a') RETURNING id INTO client_a;

  SELECT id INTO staff_uid FROM public.profiles WHERE role = 'tps_admin' LIMIT 1;
  SELECT id INTO client_uid FROM public.profiles WHERE role IN ('client_admin', 'client_user') LIMIT 1;

  -- check1: staff session can insert
  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.compliance_twin_snapshots (company_id, snapshot_date, overall_band, areas, created_by)
    VALUES (client_a, '2026-09-30', 'amber', '[{"area":"safety","band":"amber"}]'::jsonb, staff_uid)
    RETURNING id INTO snap_id;
  RAISE NOTICE 'check1 PASSED';

  -- check2: same-day re-save upserts (band changes, still one row)
  INSERT INTO public.compliance_twin_snapshots (company_id, snapshot_date, overall_band, areas, created_by)
    VALUES (client_a, '2026-09-30', 'red', '[{"area":"safety","band":"red"}]'::jsonb, staff_uid)
    ON CONFLICT (company_id, snapshot_date) DO UPDATE SET overall_band = EXCLUDED.overall_band, areas = EXCLUDED.areas, created_by = EXCLUDED.created_by;
  SELECT count(*) INTO seen FROM public.compliance_twin_snapshots WHERE company_id = client_a;
  IF seen <> 1 THEN RAISE EXCEPTION 'check2 FAILED: expected exactly one row after upsert, got %', seen; END IF;
  PERFORM 1 FROM public.compliance_twin_snapshots WHERE id = snap_id AND overall_band = 'red';
  IF NOT FOUND THEN RAISE EXCEPTION 'check2 FAILED: upsert did not update overall_band'; END IF;
  RAISE NOTICE 'check2 PASSED';

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- check3: a client (non-staff) session cannot read
  PERFORM set_config('request.jwt.claims', json_build_object('sub', client_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO seen FROM public.compliance_twin_snapshots WHERE company_id = client_a;
  IF seen <> 0 THEN RAISE EXCEPTION 'check3 FAILED: client session could read a staff-only snapshot'; END IF;
  RAISE NOTICE 'check3 PASSED';

  -- check4: a client (non-staff) session cannot write
  BEGIN
    INSERT INTO public.compliance_twin_snapshots (company_id, snapshot_date, overall_band, areas)
      VALUES (client_a, '2026-10-01', 'green', '[]'::jsonb);
    RAISE EXCEPTION 'check4 FAILED: client session could insert';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'check4 PASSED';
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  -- check5: RLS enabled
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.compliance_twin_snapshots'::regclass) THEN
    RAISE EXCEPTION 'check5 FAILED: RLS not enabled';
  END IF;
  RAISE NOTICE 'check5 PASSED';

  -- check6: audit trigger fired for the insert (audit_events row exists)
  SELECT count(*) INTO seen FROM public.audit_events WHERE entity_type = 'compliance_twin_snapshots' AND entity_id = snap_id::text;
  IF seen = 0 THEN RAISE EXCEPTION 'check6 FAILED: no audit_events row for the snapshot insert'; END IF;
  RAISE NOTICE 'check6 PASSED';
END $$;

ROLLBACK;
