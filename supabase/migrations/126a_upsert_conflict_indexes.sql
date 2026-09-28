-- ═══════════════════════════════════════════════════════════════════
-- 126a: make every upsert conflict target inferable (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- Found by the Phase 1 referral-cron check-in: the 06:00 reminders cron
-- has reported "degraded" daily with
--   "requisitions emit: there is no unique or exclusion constraint
--    matching the ON CONFLICT specification"
--
-- Cause: these idempotency keys were created as PARTIAL unique indexes
-- (`… WHERE key IS NOT NULL`). Postgres only infers a partial index for
-- ON CONFLICT when the statement repeats the index predicate, and
-- PostgREST's upsert(onConflict: 'col') never sends one — so EVERY
-- keyed upsert into these tables fails with 42P10:
--
--   platform_events (dedupe_key)             emitEvent(), reminders cron, SLA sweep
--   notifications (dedupe_key)               notify() — every in-app notification
--   email_log (dedupe_key)                   keyed claim-before-send emails
--   internal_tasks (source_ref)              SLA / RIDDOR / BD call tasks
--   actions (company_id, source_ref)         H&S failed-check actions, Raise action
--   company_calendar_events (company_id, source_ref)   interview calendar rows
--   employee_records (source_candidate_id)   hired → employee
--   performance_reviews (company_id, source_ref)       probation reviews
--
-- Measured live before the fix: 0 keyed rows in every one of them
-- (notifications 0 rows at all; email_log 1,869 rows, 0 keyed;
-- platform_events 117 rows, 0 keyed). The event consumer has run 885
-- times with 0 consequences, so no notification has yet been LOST —
-- the first real consequence would have been.
--
-- Fix: a FULL unique index on the same columns. Semantics are
-- unchanged: NULLs are distinct in a unique index, so rows without a
-- key are unconstrained exactly as before, and the partial index
-- already guaranteed no duplicate non-NULL keys, so the new index
-- builds without conflicts. The profiles partial indexes are not
-- upsert targets and are left alone.
-- ═══════════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS platform_events_dedupe_key_uq ON public.platform_events (dedupe_key);
DROP INDEX IF EXISTS public.platform_events_dedupe_idx;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedupe_key_uq ON public.notifications (dedupe_key);
DROP INDEX IF EXISTS public.notifications_dedupe_idx;

CREATE UNIQUE INDEX IF NOT EXISTS email_log_dedupe_key_uq ON public.email_log (dedupe_key);
DROP INDEX IF EXISTS public.email_log_dedupe_idx;

CREATE UNIQUE INDEX IF NOT EXISTS internal_tasks_source_ref_uq ON public.internal_tasks (source_ref);
DROP INDEX IF EXISTS public.internal_tasks_source_ref_idx;

CREATE UNIQUE INDEX IF NOT EXISTS actions_company_source_ref_uq ON public.actions (company_id, source_ref);
DROP INDEX IF EXISTS public.actions_source_ref_idx;

CREATE UNIQUE INDEX IF NOT EXISTS company_calendar_events_source_ref_uq ON public.company_calendar_events (company_id, source_ref);
DROP INDEX IF EXISTS public.company_calendar_events_source_ref_idx;

CREATE UNIQUE INDEX IF NOT EXISTS employee_records_source_candidate_uq ON public.employee_records (source_candidate_id);
DROP INDEX IF EXISTS public.employee_records_source_candidate_idx;

CREATE UNIQUE INDEX IF NOT EXISTS performance_reviews_company_source_ref_uq ON public.performance_reviews (company_id, source_ref);
DROP INDEX IF EXISTS public.performance_reviews_source_ref_idx;
