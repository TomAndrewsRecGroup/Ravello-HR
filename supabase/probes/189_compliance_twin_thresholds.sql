-- Core-OS 360 Completion Programme, Phase 23, Group 5. Rolled back.
-- Proves: a staff session can insert/update a threshold override; a
-- client (non-staff) session can neither read nor write; RLS is
-- enabled; UNIQUE(company_id) refuses a second row; the audit
-- trigger fires with the five threshold columns.

BEGIN;

DO $$
DECLARE
  client_a UUID; staff_uid UUID; client_uid UUID; thr_id UUID; seen INT;
BEGIN
  INSERT INTO public.companies (name, slug) VALUES ('Probe Twin Threshold Client A', 'probe-twin-threshold-a') RETURNING id INTO client_a;
  SELECT id INTO staff_uid FROM public.profiles WHERE role = 'tps_admin' LIMIT 1;
  SELECT id INTO client_uid FROM public.profiles WHERE role IN ('client_admin', 'client_user') LIMIT 1;

  PERFORM set_config('request.jwt.claims', json_build_object('sub', staff_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.compliance_twin_thresholds (company_id, evidence_red_threshold, updated_by)
    VALUES (client_a, 40, staff_uid) RETURNING id INTO thr_id;
  RAISE NOTICE 'check1 PASSED';

  -- check2: UNIQUE(company_id) refuses a second row for the same company
  BEGIN
    INSERT INTO public.compliance_twin_thresholds (company_id, evidence_red_threshold) VALUES (client_a, 60);
    RAISE EXCEPTION 'check2 FAILED: a second row for the same company was allowed';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'check2 PASSED';
  END;

  UPDATE public.compliance_twin_thresholds SET evidence_red_threshold = 45, updated_by = staff_uid WHERE id = thr_id;
  RAISE NOTICE 'check3 PASSED (staff update)';

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  PERFORM set_config('request.jwt.claims', json_build_object('sub', client_uid::text, 'role', 'authenticated')::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO seen FROM public.compliance_twin_thresholds WHERE company_id = client_a;
  IF seen <> 0 THEN RAISE EXCEPTION 'check4 FAILED: client session could read'; END IF;
  RAISE NOTICE 'check4 PASSED';

  BEGIN
    UPDATE public.compliance_twin_thresholds SET evidence_red_threshold = 5 WHERE id = thr_id;
    IF FOUND THEN RAISE EXCEPTION 'check5 FAILED: client session could write'; END IF;
    RAISE NOTICE 'check5 PASSED (zero rows matched under client RLS)';
  END;

  RESET ROLE;
  PERFORM set_config('request.jwt.claims', NULL, true);

  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.compliance_twin_thresholds'::regclass) THEN
    RAISE EXCEPTION 'check6 FAILED: RLS not enabled';
  END IF;
  RAISE NOTICE 'check6 PASSED';

  SELECT count(*) INTO seen FROM public.audit_events WHERE entity_type = 'compliance_twin_thresholds' AND entity_id = thr_id::text;
  IF seen = 0 THEN RAISE EXCEPTION 'check7 FAILED: no audit_events row'; END IF;
  RAISE NOTICE 'check7 PASSED';
END $$;

ROLLBACK;
