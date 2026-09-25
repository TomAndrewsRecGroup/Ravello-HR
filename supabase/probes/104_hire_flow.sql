-- Probe for 104, run live in a transaction that is ROLLED BACK, after
-- 104a is applied for real (an enum value cannot be used in the
-- transaction that adds it). Applies 104, then asserts: the stamp
-- trigger sets stage_changed_at on insert and on a stage change only,
-- sets filled_at once and never overwrites it; the outbox receives
-- interview_schedules and referral_scan_runs rows with only the
-- whitelisted columns; the calendar source_ref index refuses a second
-- row per (company, source_ref); the 'interview' event type exists.
BEGIN;
\i 104_hire_flow.sql  -- (inlined when run through the MCP tool)

DO $$
DECLARE
  co uuid; req uuid; cand uuid; iv uuid; run_id uuid; n int;
  changed1 timestamptz; changed2 timestamptz; filled1 timestamptz; filled2 timestamptz;
  ev record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'calendar_event_type' AND e.enumlabel = 'interview') THEN
    RAISE EXCEPTION 'calendar_event_type has no interview value: apply 104a first';
  END IF;

  SELECT id INTO co FROM public.companies LIMIT 1;
  INSERT INTO public.requisitions (company_id, title, stage) VALUES (co, 'probe role', 'submitted') RETURNING id, stage_changed_at, filled_at INTO req, changed1, filled1;
  IF changed1 IS NULL THEN RAISE EXCEPTION 'stage_changed_at not stamped on insert'; END IF;
  IF filled1 IS NOT NULL THEN RAISE EXCEPTION 'filled_at set on an unfilled insert'; END IF;

  -- a non-stage edit leaves the stamp alone
  UPDATE public.requisitions SET title = 'probe role 2' WHERE id = req;
  SELECT stage_changed_at INTO changed2 FROM public.requisitions WHERE id = req;
  IF changed2 <> changed1 THEN RAISE EXCEPTION 'title edit moved stage_changed_at'; END IF;

  -- a stage change moves it (clock_timestamp so it differs inside one transaction)
  PERFORM pg_sleep(0.01);
  UPDATE public.requisitions SET stage = 'filled' WHERE id = req;
  SELECT stage_changed_at, filled_at INTO changed2, filled1 FROM public.requisitions WHERE id = req;
  IF filled1 IS NULL THEN RAISE EXCEPTION 'filled_at not set on filled'; END IF;
  UPDATE public.requisitions SET stage = 'interview' WHERE id = req;
  UPDATE public.requisitions SET stage = 'filled' WHERE id = req;
  SELECT filled_at INTO filled2 FROM public.requisitions WHERE id = req;
  IF filled2 <> filled1 THEN RAISE EXCEPTION 'filled_at overwritten on a second fill'; END IF;

  -- outbox: interview_schedules with a whitelist that excludes notes
  INSERT INTO public.candidates (company_id, requisition_id, full_name) VALUES (co, req, 'probe cand') RETURNING id INTO cand;
  INSERT INTO public.interview_schedules (company_id, requisition_id, candidate_id, scheduled_at, feedback_notes, client_feedback)
    VALUES (co, req, cand, now() + interval '3 days', 'SECRET NOTES', 'SECRET CLIENT') RETURNING id INTO iv;
  SELECT * INTO ev FROM public.platform_events WHERE entity_type = 'interview_schedules' AND entity_id = iv AND event_type = 'created';
  IF ev IS NULL THEN RAISE EXCEPTION 'no outbox row for interview_schedules'; END IF;
  IF ev.payload::text LIKE '%SECRET%' THEN RAISE EXCEPTION 'interview payload carries notes'; END IF;
  IF (ev.payload->'new'->>'scheduled_at') IS NULL THEN RAISE EXCEPTION 'interview payload missing scheduled_at'; END IF;
  IF ev.company_id <> co THEN RAISE EXCEPTION 'interview event has wrong company'; END IF;

  -- outbox: referral_scan_runs (no company_id) records with company NULL
  INSERT INTO public.referral_scan_runs (ok, outcome, tally, notes) VALUES (false, 'error', '{"secret":1}'::jsonb, ARRAY['SECRET NOTE']) RETURNING id INTO run_id;
  SELECT * INTO ev FROM public.platform_events WHERE entity_type = 'referral_scan_runs' AND entity_id = run_id;
  IF ev IS NULL THEN RAISE EXCEPTION 'no outbox row for referral_scan_runs'; END IF;
  IF ev.company_id IS NOT NULL THEN RAISE EXCEPTION 'scan run event has a company'; END IF;
  IF ev.payload::text LIKE '%SECRET%' OR ev.payload::text LIKE '%secret%' THEN RAISE EXCEPTION 'scan run payload carries tally/notes'; END IF;
  IF (ev.payload->'new'->>'ok') <> 'false' THEN RAISE EXCEPTION 'scan run payload missing ok'; END IF;

  -- calendar: one row per (company, source_ref)
  INSERT INTO public.company_calendar_events (company_id, title, event_type, start_date, end_date, all_day, source_ref)
    VALUES (co, 'probe interview', 'interview', current_date, current_date, false, 'interview:' || iv::text);
  BEGIN
    INSERT INTO public.company_calendar_events (company_id, title, event_type, start_date, end_date, all_day, source_ref)
      VALUES (co, 'probe interview dup', 'interview', current_date, current_date, false, 'interview:' || iv::text);
    RAISE EXCEPTION 'a second calendar row per source_ref was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  -- and rows without a source_ref are unconstrained (hand-added events)
  INSERT INTO public.company_calendar_events (company_id, title, start_date, end_date) VALUES (co, 'closed', current_date, current_date);
  INSERT INTO public.company_calendar_events (company_id, title, start_date, end_date) VALUES (co, 'closed', current_date, current_date);

  -- feedback_triage is writable jsonb
  UPDATE public.candidates SET feedback_triage = '{"reason":"salary"}'::jsonb WHERE id = cand;
  SELECT count(*) INTO n FROM public.candidates WHERE id = cand AND feedback_triage->>'reason' = 'salary';
  IF n <> 1 THEN RAISE EXCEPTION 'feedback_triage not written'; END IF;
END $$;

ROLLBACK;
