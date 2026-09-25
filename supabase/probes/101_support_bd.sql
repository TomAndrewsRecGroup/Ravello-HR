-- Probe for 101, run live in a transaction that is ROLLED BACK: applies
-- the migration, then asserts the SLA trigger sets the clock and the
-- priority from the form's capitalised urgency, that an explicit
-- sla_due_at is kept, and that the whitelists carry the flow columns.
BEGIN;
\i 101_support_bd.sql  -- (inlined when run through the MCP tool)

DO $$
DECLARE
  co uuid; r record; args text; n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'service_requests'
    AND column_name IN ('assigned_to','priority','first_response_at','sla_due_at','triage','source');
  IF n <> 6 THEN RAISE EXCEPTION 'service_requests: expected 6 new columns, found %', n; END IF;
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bd_companies'
    AND column_name IN ('domain','company_location','friction_intel','ivylens_roles','prospect_score','next_action','scored_at','score_inputs','source','outreach_status');
  IF n <> 10 THEN RAISE EXCEPTION 'bd_companies: expected 10 new columns, found %', n; END IF;

  SELECT id INTO co FROM public.companies LIMIT 1;
  INSERT INTO public.service_requests (company_id, request_type, subject, details, urgency, status, created_at)
    VALUES (co, 'manager_support', 'probe', '{}', 'Urgent', 'new', '2026-09-25T09:00:00Z') RETURNING * INTO r;
  IF r.sla_due_at <> '2026-09-25T13:00:00Z'::timestamptz OR r.priority <> 'urgent' THEN RAISE EXCEPTION 'urgent: sla % priority %', r.sla_due_at, r.priority; END IF;
  INSERT INTO public.service_requests (company_id, request_type, subject, details, urgency, status, created_at)
    VALUES (co, 'hr_audit', 'probe', '{}', NULL, 'new', '2026-09-25T09:00:00Z') RETURNING * INTO r;
  IF r.sla_due_at <> '2026-09-28T09:00:00Z'::timestamptz OR r.priority <> 'normal' THEN RAISE EXCEPTION 'null urgency: sla % priority %', r.sla_due_at, r.priority; END IF;
  INSERT INTO public.service_requests (company_id, request_type, subject, details, urgency, status, created_at, sla_due_at)
    VALUES (co, 'hr_audit', 'probe', '{}', 'high', 'new', '2026-09-25T09:00:00Z', '2026-09-25T10:00:00Z') RETURNING * INTO r;
  IF r.sla_due_at <> '2026-09-25T10:00:00Z'::timestamptz THEN RAISE EXCEPTION 'explicit sla overwritten'; END IF;

  SELECT encode(t.tgargs, 'escape') INTO args FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'service_requests' AND t.tgname = 'service_requests_platform_event';
  IF position('sla_due_at' in args) = 0 OR position('details' in args) > 0 OR position('triage' in args) > 0 THEN RAISE EXCEPTION 'service_requests whitelist: %', args; END IF;
  SELECT encode(t.tgargs, 'escape') INTO args FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'enquiries' AND t.tgname = 'enquiries_platform_event';
  IF position('bd_company_id' in args) = 0 OR position('result' in args) > 0 THEN RAISE EXCEPTION 'enquiries whitelist: %', args; END IF;
  -- the outbox saw the three inserts
  SELECT count(*) INTO n FROM public.platform_events WHERE entity_type = 'service_requests' AND event_type = 'created' AND (payload->'new'->>'subject') = 'probe';
  IF n <> 3 THEN RAISE EXCEPTION 'expected 3 outbox rows, found %', n; END IF;
END $$;
ROLLBACK;
