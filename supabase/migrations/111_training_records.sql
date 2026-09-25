-- ═══════════════════════════════════════════════════════════════════
-- 111: LEAD Phase 4 — training records, matrix and CSV import (2026-09-25)
-- ═══════════════════════════════════════════════════════════════════
--
-- training_needs (gaps to fill) and skills_matrix (skill LEVELS) already
-- existed; neither is a record that a specific piece of training was
-- actually COMPLETED, with a date and (for anything like a fire warden
-- or first-aid certificate) an expiry to re-certify against. This is
-- that record: one row per completed course per employee.
--
-- Self-service, client-owned data — same posture as training_needs and
-- skills_matrix (which this mirrors the RLS shape of exactly, read live
-- from pg_policies rather than the migration history, which has several
-- superseded layers for those two tables): any signed-in user at the
-- company may read/write their own company's rows, only a company
-- super-user (admin/editor) may delete one, staff can do everything.
--
-- Unlike training_needs/skills_matrix (which store a free-text
-- employee_name — the "employee referenced by typed name" disconnected
-- concept this repo's CLAUDE.md already flags), this new table links
-- employee_id to employee_records from the start: a training matrix
-- needs to pivot cleanly by employee, which a name string that might be
-- mistyped twice cannot guarantee.
--
-- No platform_events outbox entry: like training_needs/skills_matrix,
-- this is a client editing their own team's data, not something staff
-- or another party needs telling about as it happens. It IS a
-- REMINDER_ENTITY — an expiring certificate is exactly the kind of
-- thing the reminders cron already exists to catch.

CREATE TABLE IF NOT EXISTS public.training_records (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id  uuid NOT NULL REFERENCES public.employee_records(id) ON DELETE CASCADE,
  course_name  text NOT NULL CHECK (length(btrim(course_name)) BETWEEN 1 AND 200),
  provider     text CHECK (length(provider) <= 200),
  completed_on date NOT NULL CHECK (completed_on <= current_date + 1),
  expires_on   date CHECK (expires_on IS NULL OR expires_on > completed_on),
  notes        text CHECK (length(notes) <= 2000),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS training_records_company_idx  ON public.training_records (company_id);
CREATE INDEX IF NOT EXISTS training_records_employee_idx ON public.training_records (employee_id);
CREATE INDEX IF NOT EXISTS training_records_expiry_idx   ON public.training_records (expires_on) WHERE expires_on IS NOT NULL;

ALTER TABLE public.training_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_training_records ON public.training_records;
CREATE POLICY admin_training_records ON public.training_records FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

-- training_needs/skills_matrix's live policies (read from pg_policies,
-- not their migration history) show the trap to avoid here: a FOR ALL
-- "client" policy plus a separate super-user-only DELETE policy does
-- NOT restrict deletion, because Postgres ORs permissive policies — the
-- broader ALL policy already lets any company user delete, making the
-- narrower one dead. SELECT/INSERT/UPDATE are granted broadly here;
-- DELETE gets its own, and ONLY its own, policy.
DROP POLICY IF EXISTS client_training_records_read   ON public.training_records;
CREATE POLICY client_training_records_read ON public.training_records FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));
DROP POLICY IF EXISTS client_training_records_insert ON public.training_records;
CREATE POLICY client_training_records_insert ON public.training_records FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id()));
DROP POLICY IF EXISTS client_training_records_update ON public.training_records;
CREATE POLICY client_training_records_update ON public.training_records FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id())) WITH CHECK (company_id = (SELECT public.my_company_id()));

DROP POLICY IF EXISTS training_records_delete ON public.training_records;
CREATE POLICY training_records_delete ON public.training_records FOR DELETE TO authenticated
  USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()));
