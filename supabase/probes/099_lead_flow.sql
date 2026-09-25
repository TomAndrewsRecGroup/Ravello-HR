-- Probe for 099, run live in a transaction that is ROLLED BACK.
-- Applies the migration, then asserts the shape it should leave and
-- that the two unique indexes actually refuse a second row. Returns
-- nothing on success; a failed assertion raises.
BEGIN;
\i 099_lead_flow.sql  -- (inlined when run through the MCP tool)

DO $$
DECLARE
  cols text[];
  args text;
  n int;
BEGIN
  -- columns
  SELECT array_agg(column_name::text ORDER BY column_name) INTO cols FROM information_schema.columns
   WHERE table_schema = 'public' AND (
     (table_name = 'employee_records' AND column_name = 'source_candidate_id') OR
     (table_name = 'onboarding_task_progress' AND column_name = 'assigned_to') OR
     (table_name = 'offboarding_task_progress' AND column_name = 'assigned_to') OR
     (table_name = 'performance_reviews' AND column_name IN ('employee_id', 'source_ref')) OR
     (table_name = 'employee_documents' AND column_name = 'employee_id'));
  IF cardinality(cols) <> 6 THEN RAISE EXCEPTION 'expected 6 new columns, found %', cols; END IF;

  -- trigger whitelist carries the join column
  SELECT encode(t.tgargs, 'escape') INTO args FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
   WHERE c.relname = 'employee_records' AND t.tgname = 'employee_records_platform_event';
  IF args IS NULL OR position('source_candidate_id' in args) = 0 THEN RAISE EXCEPTION 'trigger args: %', args; END IF;
  IF position('salary' in args) > 0 THEN RAISE EXCEPTION 'salary in whitelist'; END IF;

  -- the unique partial indexes refuse a second row
  SELECT count(*) INTO n FROM pg_indexes WHERE schemaname = 'public'
    AND indexname IN ('employee_records_source_candidate_idx', 'performance_reviews_source_ref_idx');
  IF n <> 2 THEN RAISE EXCEPTION 'expected 2 indexes, found %', n; END IF;

  BEGIN
    INSERT INTO public.performance_reviews (company_id, employee_name, review_period, review_type, status, source_ref)
      SELECT id, 'probe', 'probe', 'probation', 'pending', 'probe:dup' FROM public.companies LIMIT 1;
    INSERT INTO public.performance_reviews (company_id, employee_name, review_period, review_type, status, source_ref)
      SELECT id, 'probe', 'probe', 'probation', 'pending', 'probe:dup' FROM public.companies LIMIT 1;
    RAISE EXCEPTION 'duplicate source_ref was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  -- two NULL source_refs are fine
  INSERT INTO public.performance_reviews (company_id, employee_name, review_period, review_type, status)
    SELECT id, 'probe', 'probe', 'annual', 'pending' FROM public.companies LIMIT 1;
  INSERT INTO public.performance_reviews (company_id, employee_name, review_period, review_type, status)
    SELECT id, 'probe', 'probe', 'annual', 'pending' FROM public.companies LIMIT 1;
END $$;
ROLLBACK;
