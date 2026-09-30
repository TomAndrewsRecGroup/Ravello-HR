-- Core-OS 360 Completion Programme, Phase 28, Group 2 (closes the
-- remaining slice of gap-ledger row C1.12 — "optimistic locking on
-- shared records"). The Phase-24 slice (consultancy_visit_reports,
-- migration 190) is already closed; this is the ONE genuine gap found
-- by tracing every UPDATE call site against employee_records across
-- both apps, per the Phase 28 plan doc.
--
-- EmployeeRecordsClient.tsx's edit-form save is an UNCONDITIONAL
-- `.update(body).eq('id', editingId)` — two staff members (or a
-- client_admin and a consultant acting on their behalf) editing the
-- same employee's record at once have the second save silently
-- overwrite the first's changes with no detection, the exact risk
-- migration 190's own header already named for a different table.
-- The other employee_records writers checked and found NOT to be this
-- risk: the hire/onboarding INSERT path (no concurrent-edit window —
-- a row does not exist yet to race on), the employee-terminated status
-- write from the reminders cron (a single, scheduled writer, never
-- racing a human edit of the same field), and the org-chart self-seed
-- insert (idempotent, guarded by a row-count check, not a race target).
--
-- Same pattern this codebase already uses throughout (123's hazard/RA
-- guards, 124's RAMS/COSHH guards, 125's incident guard, 190's own
-- consultancy_visit_reports guard): a row_version column, forced to 1
-- on INSERT and to OLD+1 on every UPDATE regardless of whatever the
-- caller sent — the trigger's own overwrite is what makes the client's
-- `.eq('row_version', expected)` conditional update an honest
-- optimistic-lock check, not a value the caller could game by sending
-- a higher number.
--
-- Matches this table's OWN existing trigger convention (person_same_
-- org_guard/person_sync_from_source/employee_records_sensitive_write_
-- guard), not 190's: SECURITY INVOKER, not DEFINER — neither new
-- function reads another table or needs elevated privilege, only
-- OLD/NEW on the row already being written, so DEFINER would be an
-- unnecessary privilege escalation.
--
-- row_version is bookkeeping, not a fact worth reporting: it is added
-- to NEITHER the audit_row() whitelist on employee_records_audit NOR
-- the platform_event_row() whitelist on employee_records_platform_
-- event — the exact choice 190 already made for consultancy_visit_
-- reports' own row_version.

ALTER TABLE public.employee_records
  ADD COLUMN IF NOT EXISTS row_version integer NOT NULL DEFAULT 1;

-- Additive column-level grant (131's own REVOKE + full re-GRANT
-- already restricted `authenticated` to a named column list; a new
-- column needs its own additive GRANT SELECT, not a second REVOKE +
-- rewrite of the whole list, the exact "additive grant" discipline
-- 131's own header comment already establishes for future columns).
GRANT SELECT (row_version) ON public.employee_records TO authenticated;

CREATE OR REPLACE FUNCTION public.employee_records_row_version_fill()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  NEW.row_version := 1;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.employee_records_row_version_fill() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.employee_records_row_version_touch()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  -- Always OLD+1, regardless of whatever row_version the caller sent —
  -- this is what makes the client's own `.eq('row_version', ...)`
  -- conditional update an honest optimistic-lock check.
  NEW.row_version := OLD.row_version + 1;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.employee_records_row_version_touch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS employee_records_row_version_fill ON public.employee_records;
CREATE TRIGGER employee_records_row_version_fill
  BEFORE INSERT ON public.employee_records
  FOR EACH ROW EXECUTE FUNCTION public.employee_records_row_version_fill();

DROP TRIGGER IF EXISTS employee_records_row_version_touch ON public.employee_records;
CREATE TRIGGER employee_records_row_version_touch
  BEFORE UPDATE ON public.employee_records
  FOR EACH ROW EXECUTE FUNCTION public.employee_records_row_version_touch();
