-- ═══════════════════════════════════════════════════════════
-- 099: LEAD / HR flow columns
-- ═══════════════════════════════════════════════════════════
-- Additive; apply before the PR 3 code deploys. 100 adds the CHECK
-- after the deploy.
--
-- "Hired" was stored five unlinked ways (candidate status, offer status,
-- requisition stage, an employee record, an internal applicant). The
-- join point is employee_records.source_candidate_id: the consumer
-- creates one employee per hired candidate and never a second, and the
-- Mark-as-Hired form stamps the same column so the consumer finds it.

ALTER TABLE public.employee_records ADD COLUMN IF NOT EXISTS source_candidate_id uuid REFERENCES public.candidates(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employee_records_source_candidate_idx ON public.employee_records (source_candidate_id) WHERE source_candidate_id IS NOT NULL;

-- A checklist task can name who is responsible (copied from the template).
ALTER TABLE public.onboarding_task_progress  ADD COLUMN IF NOT EXISTS assigned_to text;
ALTER TABLE public.offboarding_task_progress ADD COLUMN IF NOT EXISTS assigned_to text;

-- Reviews and employee documents can point at the employee row rather
-- than a typed name; the probation review is created once per employee.
ALTER TABLE public.performance_reviews ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employee_records(id) ON DELETE SET NULL;
ALTER TABLE public.performance_reviews ADD COLUMN IF NOT EXISTS source_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS performance_reviews_source_ref_idx ON public.performance_reviews (company_id, source_ref) WHERE source_ref IS NOT NULL;
ALTER TABLE public.employee_documents ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employee_records(id) ON DELETE SET NULL;

-- The employee_records trigger whitelist gains the join column so the
-- consumer can see which candidate an employee came from.
DROP TRIGGER IF EXISTS employee_records_platform_event ON public.employee_records;
CREATE TRIGGER employee_records_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.employee_records
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','start_date','end_date','probation_end','full_name','job_title','department','source_candidate_id');
