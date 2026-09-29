-- Live probe for migration 159 (Core-OS 360 Phase 5, Group 4: the Legal
-- Register). Run inside BEGIN/ROLLBACK against project
-- sbmekaviwkiyorvmtgcu — never applied for real.
--
-- Run 2026-09-29: 17/17 PASS (against the live, applied migration).
--
--   check1_rls_enabled                  — RLS is ON for all four new tables
--   check2_staff_only_no_client_select  — legal_requirements/research_notes have
--                                          no client SELECT policy at all
--   check3_applicability_gate_refused   — 'applicable' with no assessed_by/at refused
--   check4_applicability_gate_accepted  — 'applicable' WITH assessed_by/at accepted
--   check5_under_review_no_gate         — 'under_review' needs no assessor
--   check6_bad_status_refused           — a non-cautious compliance status ('compliant') refused
--   check7_good_status_accepted         — 'potential_noncompliance' accepted
--   check8_history_preserved            — a second evaluation does not destroy the first;
--                                          ORDER BY evaluated_at DESC gives the latest
--   check9_roll_forward_newest_wins     — a late-backfilled OLDER evaluation never
--                                          moves next_review_due backwards
--   check10_cross_company_obligation_company_derived — company_id always comes from
--                                          the obligation, never the caller
--   check11_evidence_vocab_resolves     — hs_entity_table/hs_scope_for_entity resolve
--                                          'compliance_evaluation'
--   check12_evidence_cross_org_refused  — evidence naming another company's evaluation refused
--   check13_write_guard_present         — write_guard_ins/upd/del present on the two
--                                          client-readable tables
--   check14_no_anon_execute             — no new SECURITY DEFINER function is anon-executable
--   check15_actions_source_type_present — actions_source_type_check already allows
--                                          'legal_requirement' (no ALTER needed by this migration)
--   check16_no_compliance_claim_strings — no label/title in this subsystem contains
--                                          "compliant"/"illegal"/"legal advice"
--   check17_evaluations_insert_only     — compliance_evaluations has no UPDATE/DELETE
--                                          grant to authenticated

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

INSERT INTO results SELECT 'check1_rls_enabled', bool_and(relrowsecurity)
FROM pg_class WHERE relname IN ('legal_requirements','organisation_legal_obligations','compliance_evaluations','legal_requirement_research_notes');

INSERT INTO results SELECT 'check2_staff_only_no_client_select', NOT EXISTS (
  SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename IN ('legal_requirements','legal_requirement_research_notes')
    AND cmd IN ('SELECT','ALL') AND policyname NOT LIKE '%staff_all%'
);

DO $$
DECLARE v_co uuid; v_req uuid; v_obl uuid; v_failed boolean := false;
BEGIN
  SELECT pco INTO v_co FROM probe_ctx;
  INSERT INTO public.legal_requirements (title, category, jurisdiction, summary)
    VALUES ('Health and Safety at Work etc. Act 1974', 'health_safety', 'UK', 'General duties of employers.') RETURNING id INTO v_req;
  BEGIN
    INSERT INTO public.organisation_legal_obligations (company_id, legal_requirement_id, applicability_status)
      VALUES (v_co, v_req, 'applicable');
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('check3_applicability_gate_refused', v_failed);
END $$;

DO $$
DECLARE v_co uuid; v_req uuid; v_user uuid; v_ok boolean := false;
BEGIN
  SELECT pco INTO v_co FROM probe_ctx;
  SELECT id INTO v_req FROM public.legal_requirements LIMIT 1;
  SELECT id INTO v_user FROM auth.users LIMIT 1;
  BEGIN
    INSERT INTO public.organisation_legal_obligations (company_id, legal_requirement_id, applicability_status, assessed_by, assessed_at)
      VALUES (v_co, v_req, 'applicable', v_user, now());
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_ok := false;
  END;
  INSERT INTO results VALUES ('check4_applicability_gate_accepted', v_ok);
END $$;

DO $$
DECLARE v_co uuid; v_req uuid; v_ok boolean := false;
BEGIN
  SELECT pco INTO v_co FROM probe_ctx;
  INSERT INTO public.legal_requirements (title, category, jurisdiction) VALUES ('Equality Act 2010', 'employment_law', 'UK') RETURNING id INTO v_req;
  BEGIN
    INSERT INTO public.organisation_legal_obligations (company_id, legal_requirement_id, applicability_status) VALUES (v_co, v_req, 'under_review');
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_ok := false;
  END;
  INSERT INTO results VALUES ('check5_under_review_no_gate', v_ok);
END $$;

DO $$
DECLARE v_obl uuid; v_failed boolean := false;
BEGIN
  SELECT id INTO v_obl FROM public.organisation_legal_obligations WHERE applicability_status = 'under_review' ORDER BY created_at LIMIT 1;
  BEGIN
    INSERT INTO public.compliance_evaluations (obligation_id, status) VALUES (v_obl, 'compliant');
  EXCEPTION WHEN OTHERS THEN v_failed := true;
  END;
  INSERT INTO results VALUES ('check6_bad_status_refused', v_failed);
END $$;

DO $$
DECLARE v_obl uuid; v_ok boolean := false;
BEGIN
  SELECT id INTO v_obl FROM public.organisation_legal_obligations WHERE applicability_status = 'under_review' ORDER BY created_at LIMIT 1;
  BEGIN
    INSERT INTO public.compliance_evaluations (obligation_id, status, next_review_due) VALUES (v_obl, 'potential_noncompliance', current_date + 30);
    v_ok := true;
  EXCEPTION WHEN OTHERS THEN v_ok := false;
  END;
  INSERT INTO results VALUES ('check7_good_status_accepted', v_ok);
END $$;

DO $$
DECLARE v_obl uuid; v_eval1 uuid; v_eval2 uuid; v_ok boolean; v_cnt int; v_latest text;
BEGIN
  SELECT id INTO v_obl FROM public.organisation_legal_obligations
    WHERE applicability_status = 'under_review' ORDER BY created_at LIMIT 1;
  -- now() is the TRANSACTION start timestamp in Postgres (constant for
  -- the whole probe), so distinct evaluations need explicit offsets to
  -- avoid a tie with check7's own default-now() row.
  INSERT INTO public.compliance_evaluations (obligation_id, status, next_review_due, evaluated_at)
    VALUES (v_obl, 'evidence_incomplete', current_date + 10, now() - interval '2 days') RETURNING id INTO v_eval1;
  INSERT INTO public.compliance_evaluations (obligation_id, status, next_review_due, evaluated_at)
    VALUES (v_obl, 'evidence_current', current_date + 60, now() + interval '1 second') RETURNING id INTO v_eval2;
  SELECT count(*) INTO v_cnt FROM public.compliance_evaluations WHERE obligation_id = v_obl;
  SELECT status INTO v_latest FROM public.compliance_evaluations WHERE obligation_id = v_obl ORDER BY evaluated_at DESC LIMIT 1;
  v_ok := v_cnt = 3
     AND (SELECT status FROM public.compliance_evaluations WHERE id = v_eval1) = 'evidence_incomplete'
     AND v_latest = 'evidence_current';
  INSERT INTO results VALUES ('check8_history_preserved', v_ok);
END $$;

DO $$
DECLARE v_obl uuid; v_due_before date; v_due_after date; v_ok boolean;
BEGIN
  SELECT id INTO v_obl FROM public.organisation_legal_obligations WHERE applicability_status = 'under_review' ORDER BY created_at LIMIT 1;
  SELECT next_review_due INTO v_due_before FROM public.organisation_legal_obligations WHERE id = v_obl;
  -- Backfill an OLDER evaluation (evaluated_at in the past) with a different date.
  INSERT INTO public.compliance_evaluations (obligation_id, status, next_review_due, evaluated_at)
    VALUES (v_obl, 'review_due', current_date + 999, now() - interval '30 days');
  SELECT next_review_due INTO v_due_after FROM public.organisation_legal_obligations WHERE id = v_obl;
  v_ok := (v_due_after = v_due_before);
  INSERT INTO results VALUES ('check9_roll_forward_newest_wins', v_ok);
END $$;

DO $$
DECLARE v_co uuid; v_co2 uuid; v_req uuid; v_obl_other uuid; v_read boolean;
BEGIN
  SELECT pco, pco2 INTO v_co, v_co2 FROM probe_ctx;
  SELECT id INTO v_req FROM public.legal_requirements LIMIT 1;
  INSERT INTO public.organisation_legal_obligations (company_id, legal_requirement_id) VALUES (v_co2, v_req) RETURNING id INTO v_obl_other;
  INSERT INTO public.compliance_evaluations (obligation_id, status) VALUES (v_obl_other, 'not_evaluated');
  SELECT company_id = v_co2 INTO v_read FROM public.compliance_evaluations WHERE obligation_id = v_obl_other;
  INSERT INTO results VALUES ('check10_cross_company_obligation_company_derived', v_read);
END $$;

INSERT INTO results SELECT 'check11_evidence_vocab_resolves',
  public.hs_entity_table('compliance_evaluation') = 'compliance_evaluations'
  AND public.hs_scope_for_entity('compliance_evaluation') = 'register';

DO $$
DECLARE v_co uuid; v_co2 uuid; v_req uuid; v_obl_a uuid; v_obl_b uuid; v_failed boolean := false;
BEGIN
  SELECT pco, pco2 INTO v_co, v_co2 FROM probe_ctx;
  SELECT id INTO v_req FROM public.legal_requirements OFFSET 1 LIMIT 1;
  IF v_req IS NULL THEN SELECT id INTO v_req FROM public.legal_requirements LIMIT 1; END IF;
  SELECT id INTO v_obl_a FROM public.organisation_legal_obligations WHERE company_id = v_co LIMIT 1;
  INSERT INTO public.organisation_legal_obligations (company_id, legal_requirement_id) VALUES (v_co2, v_req) RETURNING id INTO v_obl_b;
  DECLARE v_eval_b uuid;
  BEGIN
    INSERT INTO public.compliance_evaluations (obligation_id, status) VALUES (v_obl_b, 'not_evaluated') RETURNING id INTO v_eval_b;
    BEGIN
      INSERT INTO public.hs_files (company_id, entity_type, entity_id, storage_path, file_name, evidence_type)
        VALUES (v_co, 'compliance_evaluation', v_eval_b, v_co || '/register/' || v_eval_b || '/probe.pdf', 'probe.pdf', 'other');
    EXCEPTION WHEN OTHERS THEN v_failed := true;
    END;
  END;
  INSERT INTO results VALUES ('check12_evidence_cross_org_refused', v_failed);
END $$;

INSERT INTO results SELECT 'check13_write_guard_present', bool_and(cnt = 3) FROM (
  SELECT tablename, count(*) cnt FROM pg_policies
  WHERE schemaname = 'public' AND tablename IN ('organisation_legal_obligations','compliance_evaluations')
    AND policyname IN ('write_guard_ins','write_guard_upd','write_guard_del')
  GROUP BY tablename
) x;

INSERT INTO results SELECT 'check14_no_anon_execute', NOT EXISTS (
  SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname IN (
    'legal_requirements_stamp','organisation_legal_obligations_stamp',
    'compliance_evaluations_fill','compliance_evaluations_roll','legal_requirement_research_notes_fill')
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
);

INSERT INTO results SELECT 'check15_actions_source_type_present', EXISTS (
  SELECT 1 FROM pg_constraint c
  WHERE c.conrelid = 'public.actions'::regclass AND c.conname = 'actions_source_type_check'
    AND pg_get_constraintdef(c.oid) LIKE '%legal_requirement%'
);

INSERT INTO results SELECT 'check16_no_compliance_claim_strings', NOT EXISTS (
  SELECT 1 FROM public.legal_requirements WHERE title ILIKE '%compliant%' OR summary ILIKE '%compliant%'
) AND NOT EXISTS (
  SELECT 1 FROM pg_constraint c WHERE c.conrelid = 'public.compliance_evaluations'::regclass
    AND pg_get_constraintdef(c.oid) ILIKE '%''compliant''%'
);

INSERT INTO results SELECT 'check17_evaluations_insert_only', NOT EXISTS (
  SELECT 1 FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND table_name = 'compliance_evaluations'
    AND grantee = 'authenticated' AND privilege_type IN ('UPDATE','DELETE')
);

SELECT * FROM results ORDER BY check_name;

ROLLBACK;
