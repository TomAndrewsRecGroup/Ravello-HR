-- The five job fields Manatal has and we had nowhere to keep.
--
-- THE MEASUREMENT
--
-- Job 4337074 was the first role published through the admin route
-- (2026-09-01 10:21). Comparing it against the jobs the operator
-- creates by hand in Manatal, and against what he corrected it to at
-- 12:29, gives an exact list of what our side cannot express:
--
--   field               his native jobs   ours, as created
--   ------------------  ----------------  ----------------------------
--   headcount           1                 null
--   currency            GBP               'GBP', hardcoded in the route
--   frequency           'year'            not sent  (role is PER HOUR)
--   is_salary_visible   false             not sent
--   industry            set per job        not sent
--
-- `currency` is the one to look at twice. The route hardcoded 'GBP'
-- while the role pays **$60-$120 per hour**, so the advert asserted a
-- currency and a period that were both wrong — and a wrong salary is
-- not a cosmetic defect on a job board, it is the number candidates
-- self-select on.
--
-- Every column is NULLABLE and every one is OMITTED from the Manatal
-- create when unset. Nothing about an existing requisition changes,
-- and a role published without filling these in behaves exactly as it
-- does today.

ALTER TABLE public.requisitions
  ADD COLUMN IF NOT EXISTS headcount           integer,
  ADD COLUMN IF NOT EXISTS salary_currency     text,
  ADD COLUMN IF NOT EXISTS salary_period       text,
  ADD COLUMN IF NOT EXISTS salary_visible      boolean,
  ADD COLUMN IF NOT EXISTS manatal_industry_id text;

-- Bounds, not vocabularies. `salary_period` is checked against the set
-- the mapper emits so a typo cannot reach Manatal and fail the whole
-- create; the app-side list lives in `manatalJobFields.ts`.
ALTER TABLE public.requisitions
  DROP CONSTRAINT IF EXISTS requisitions_headcount_positive;
ALTER TABLE public.requisitions
  ADD CONSTRAINT requisitions_headcount_positive
  CHECK (headcount IS NULL OR headcount > 0);

ALTER TABLE public.requisitions
  DROP CONSTRAINT IF EXISTS requisitions_salary_period_known;
ALTER TABLE public.requisitions
  ADD CONSTRAINT requisitions_salary_period_known
  CHECK (salary_period IS NULL OR salary_period IN ('year','month','week','day','hour'));

-- ISO-4217. Manatal validates the code and rejects the create on a bad
-- one, so '£' or 'pounds' must never reach it.
ALTER TABLE public.requisitions
  DROP CONSTRAINT IF EXISTS requisitions_salary_currency_iso;
ALTER TABLE public.requisitions
  ADD CONSTRAINT requisitions_salary_currency_iso
  CHECK (salary_currency IS NULL OR salary_currency ~ '^[A-Z]{3}$');

COMMENT ON COLUMN public.requisitions.salary_period IS
  'Manatal `frequency`. NULL omits the field — deliberately, because a '
  'default of ''year'' on an hourly rate advertises a wrong number.';

COMMENT ON COLUMN public.requisitions.salary_currency IS
  'ISO-4217. Was hardcoded ''GBP'' in the publish route; the first role '
  'published paid in USD.';

COMMENT ON COLUMN public.requisitions.manatal_industry_id IS
  'Manatal industry id for this job. Account-scoped and discovered from '
  'Manatal at publish time — never guessed, omitted when unknown.';
