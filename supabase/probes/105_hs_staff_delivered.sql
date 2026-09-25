-- Probe for 105, run live in a transaction that was ROLLED BACK before
-- 105 was applied for real (2026-09-25). Asserts: every provider table,
-- column and function is gone; a staff-recorded register item and
-- completion still write a Safety Timeline event; hs_actor_kind() has
-- no provider branch; the dead bd_companies/bd_ivylens_dismissed
-- objects are gone.
BEGIN;
\i 105_hs_staff_delivered.sql  -- (inlined when run through the MCP tool)

DO $$
DECLARE co uuid; it uuid; n int;
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name IN ('hs_providers','hs_provider_companies','bd_ivylens_dismissed')) THEN
    RAISE EXCEPTION 'provider/dismiss tables still exist';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='hs_provider_id') THEN
    RAISE EXCEPTION 'profiles.hs_provider_id still exists';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name IN ('compliance_items','hs_register_completions','hs_activities','hs_files','hs_events') AND column_name='provider_id') THEN
    RAISE EXCEPTION 'a provider_id column still exists';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bd_companies' AND column_name IN ('domain','company_location','friction_intel','ivylens_roles')) THEN
    RAISE EXCEPTION 'a dead bd_companies column still exists';
  END IF;
  IF EXISTS (SELECT proname FROM pg_proc WHERE proname IN ('my_hs_provider_id','hs_can_access','hs_can_write','hs_path_company','hs_my_companies','hs_event_assignment')) THEN
    RAISE EXCEPTION 'a dropped function still exists';
  END IF;

  SELECT id INTO co FROM public.companies LIMIT 1;
  INSERT INTO public.compliance_items (company_id, title, category, due_date, recurrence_every, recurrence_unit)
    VALUES (co, 'probe 105 fire alarm', 'hs_fire', current_date + 30, 1, 'year') RETURNING id INTO it;
  INSERT INTO public.hs_register_completions (item_id, completed_on, outcome) VALUES (it, current_date, 'pass');
  SELECT count(*) INTO n FROM public.hs_events WHERE entity_id = it;
  IF n = 0 THEN RAISE EXCEPTION 'no timeline event for the register item'; END IF;
  IF public.hs_actor_kind() NOT IN ('staff','client','system') THEN RAISE EXCEPTION 'hs_actor_kind returned an unexpected value'; END IF;
  RAISE NOTICE 'probe 105 ok';
END $$;

ROLLBACK;
