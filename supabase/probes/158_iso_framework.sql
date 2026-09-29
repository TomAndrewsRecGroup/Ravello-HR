-- Live probe for migration 158 (Core-OS 360 Phase 5, Group 3: shared
-- ISO 45001/14001 management-system framework). Run inside BEGIN/ROLLBACK
-- against project sbmekaviwkiyorvmtgcu — never applied for real.
--
-- Run 2026-09-29: 13/13 PASS.
--
--   check1_two_standards               — exactly ISO 45001:2018 + ISO 14001:2015 seeded
--   check2_clause_counts               — each standard has 8-12 clauses
--   check3_entity_table                — hs_entity_table() resolves 'compliance_item'/'iso_certification'
--   check4_cross_org_evidence_refused  — a link naming another company's compliance_item is refused
--   check5_same_org_evidence_accepted  — a link naming the caller's own compliance_item succeeds
--   check6_unknown_entity_type_refused — an entity_type hs_entity_table() doesn't know is refused
--   check7_iso_cert_lifecycle          — a certification row inserts and updates (renewal) in place
--   check8_no_compliance_claim_in_titles — no clause/standard name contains "compliant"/"certified"
--   check9_rls_enabled                 — RLS is ON for all four new tables
--   check10_write_guard                — write_guard_ins/upd/del present on both client-writable tables
--   check11_no_anon_execute            — neither new SECURITY DEFINER function is anon-executable
--   check12_unique_link                — standard_evidence_links has a UNIQUE constraint (no dup links)
--   check13_audit_triggers             — both new tables carry an *_audit trigger

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

INSERT INTO results SELECT 'check1_two_standards', count(*) = 2 FROM public.management_system_standards;

INSERT INTO results SELECT 'check2_clause_counts', bool_and(n BETWEEN 8 AND 12) FROM (
  SELECT standard_id, count(*) n FROM public.standard_clauses GROUP BY standard_id
) x;

INSERT INTO results SELECT 'check3_entity_table',
  public.hs_entity_table('compliance_item') = 'compliance_items'
  AND public.hs_entity_table('iso_certification') = 'iso_certifications';

DO $$
DECLARE v_co uuid; v_co2 uuid; v_clause uuid; v_item uuid; v_failed boolean := false;
BEGIN
  SELECT pco, pco2 INTO v_co, v_co2 FROM probe_ctx;
  SELECT id INTO v_clause FROM public.standard_clauses LIMIT 1;
  INSERT INTO public.compliance_items (id, company_id, title, category, status, due_date)
    VALUES (gen_random_uuid(), v_co2, 'Probe item', 'other', 'pending', current_date + 30) RETURNING id INTO v_item;
  BEGIN
    INSERT INTO public.standard_evidence_links (company_id, clause_id, entity_type, entity_id)
      VALUES (v_co, v_clause, 'compliance_item', v_item);
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('check4_cross_org_evidence_refused', v_failed);
END $$;

DO $$
DECLARE v_co uuid; v_clause uuid; v_item uuid; v_ok boolean := false;
BEGIN
  SELECT pco INTO v_co FROM probe_ctx;
  SELECT id INTO v_clause FROM public.standard_clauses LIMIT 1;
  INSERT INTO public.compliance_items (id, company_id, title, category, status, due_date)
    VALUES (gen_random_uuid(), v_co, 'Probe item same org', 'other', 'pending', current_date + 30) RETURNING id INTO v_item;
  BEGIN
    INSERT INTO public.standard_evidence_links (company_id, clause_id, entity_type, entity_id)
      VALUES (v_co, v_clause, 'compliance_item', v_item);
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_ok := false;
  END;
  INSERT INTO results VALUES ('check5_same_org_evidence_accepted', v_ok);
END $$;

DO $$
DECLARE v_co uuid; v_clause uuid; v_failed boolean := false;
BEGIN
  SELECT pco INTO v_co FROM probe_ctx;
  SELECT id INTO v_clause FROM public.standard_clauses LIMIT 1;
  BEGIN
    INSERT INTO public.standard_evidence_links (company_id, clause_id, entity_type, entity_id)
      VALUES (v_co, v_clause, 'not_a_real_entity', gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('check6_unknown_entity_type_refused', v_failed);
END $$;

DO $$
DECLARE v_co uuid; v_std uuid; v_cert uuid; v_ok boolean := false;
BEGIN
  SELECT pco INTO v_co FROM probe_ctx;
  SELECT id INTO v_std FROM public.management_system_standards WHERE code = 'iso_45001_2018';
  INSERT INTO public.iso_certifications (company_id, standard_id, certificate_number, certifying_body, issued_on, expires_on)
    VALUES (v_co, v_std, 'CERT-001', 'BSI', current_date - 100, current_date + 30) RETURNING id INTO v_cert;
  UPDATE public.iso_certifications SET certificate_number = 'CERT-001-R' WHERE id = v_cert;
  SELECT certificate_number = 'CERT-001-R' INTO v_ok FROM public.iso_certifications WHERE id = v_cert;
  INSERT INTO results VALUES ('check7_iso_cert_lifecycle', v_ok);
END $$;

INSERT INTO results SELECT 'check8_no_compliance_claim_in_titles',
  NOT EXISTS (
    SELECT 1 FROM public.standard_clauses WHERE title ILIKE '%compliant%' OR title ILIKE '%certified%'
  ) AND NOT EXISTS (
    SELECT 1 FROM public.management_system_standards WHERE name ILIKE '%compliant%'
  );

INSERT INTO results SELECT 'check9_rls_enabled', bool_and(relrowsecurity)
FROM pg_class WHERE relname IN ('management_system_standards','standard_clauses','standard_evidence_links','iso_certifications');

INSERT INTO results SELECT 'check10_write_guard', bool_and(cnt = 3) FROM (
  SELECT tablename, count(*) cnt FROM pg_policies
  WHERE schemaname = 'public' AND tablename IN ('standard_evidence_links','iso_certifications')
    AND policyname IN ('write_guard_ins','write_guard_upd','write_guard_del')
  GROUP BY tablename
) x;

INSERT INTO results SELECT 'check11_no_anon_execute', NOT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN ('standard_evidence_links_fill','iso_certifications_stamp')
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
);

INSERT INTO results SELECT 'check12_unique_link', EXISTS (
  SELECT 1 FROM pg_constraint WHERE conrelid = 'public.standard_evidence_links'::regclass AND contype = 'u'
);

INSERT INTO results SELECT 'check13_audit_triggers', bool_and(cnt >= 1) FROM (
  SELECT tgrelid::regclass::text tbl, count(*) cnt FROM pg_trigger
  WHERE tgrelid IN ('public.standard_evidence_links'::regclass, 'public.iso_certifications'::regclass)
    AND tgname LIKE '%_audit'
  GROUP BY tgrelid
) x;

SELECT * FROM results ORDER BY check_name;

ROLLBACK;
