-- Probe for 103, run live in a transaction that is ROLLED BACK: applies
-- the migration, then asserts the token table is service-role only
-- (RLS on, no policies), a link dies with its row (cascade), the hash
-- CHECK refuses a raw token, and acknowledged_via refuses a stray value.
BEGIN;
\i 103_policy_ack_tokens.sql  -- (inlined when run through the MCP tool)

DO $$
DECLARE
  co uuid; emp uuid; doc uuid; ack uuid; n int; rls boolean;
BEGIN
  SELECT relrowsecurity INTO rls FROM pg_class WHERE relname = 'policy_ack_tokens' AND relnamespace = 'public'::regnamespace;
  IF NOT rls THEN RAISE EXCEPTION 'RLS off'; END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname = 'public' AND tablename = 'policy_ack_tokens';
  IF n <> 0 THEN RAISE EXCEPTION 'expected no policies, found %', n; END IF;
  IF has_table_privilege('authenticated', 'public.policy_ack_tokens', 'SELECT') THEN RAISE EXCEPTION 'authenticated can select'; END IF;
  IF has_table_privilege('anon', 'public.policy_ack_tokens', 'SELECT') THEN RAISE EXCEPTION 'anon can select'; END IF;

  SELECT id INTO co FROM public.companies LIMIT 1;
  INSERT INTO public.employee_records (company_id, full_name, job_title, start_date, status) VALUES (co, 'probe', 'probe', current_date, 'active') RETURNING id INTO emp;
  INSERT INTO public.documents (company_id, name, category, file_url) VALUES (co, 'probe', 'policy', 'https://example.com/probe') RETURNING id INTO doc;
  INSERT INTO public.policy_acknowledgements (company_id, document_id, employee_id, status) VALUES (co, doc, emp, 'pending') RETURNING id INTO ack;
  INSERT INTO public.policy_ack_tokens (token_hash, acknowledgement_id, expires_at) VALUES (repeat('a', 64), ack, now() + interval '30 days');

  BEGIN
    INSERT INTO public.policy_ack_tokens (token_hash, acknowledgement_id, expires_at) VALUES ('11111111-2222-4333-8444-555555555555', ack, now());
    RAISE EXCEPTION 'a raw uuid was accepted as a hash';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    UPDATE public.policy_acknowledgements SET acknowledged_via = 'phone' WHERE id = ack;
    RAISE EXCEPTION 'acknowledged_via accepted a stray value';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  UPDATE public.policy_acknowledgements SET acknowledged_via = 'link', link_sent_at = now() WHERE id = ack;

  DELETE FROM public.policy_acknowledgements WHERE id = ack;
  SELECT count(*) INTO n FROM public.policy_ack_tokens WHERE acknowledgement_id = ack;
  IF n <> 0 THEN RAISE EXCEPTION 'token survived its row'; END IF;
END $$;
ROLLBACK;
