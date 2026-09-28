-- ═══════════════════════════════════════════════════════════════════
-- 131: employee_records sensitive columns (HOTFIX, 2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- Found by the Phase 3 pre-flight gate (High): employee_records_select
-- is row-level only (company_id = my_company_id() OR staff) and
-- `authenticated` held table-level SELECT, so ANY signed-in user of a
-- client (the `employee` role included) could read every colleague's
-- salary, NI number, tax code, date of birth, diversity data, address
-- and emergency contacts. Proven live in a rolled-back transaction
-- (a client_user read salary=95000, ni=QQ123456C, dob=1980-01-01).
-- 0 live rows were exposed: employee_records held 0 rows.
--
-- RLS is row-level; it cannot hide a column. So:
--
-- 1. Table-level SELECT is revoked from anon and authenticated and
--    re-granted to authenticated on the NON-sensitive columns only
--    (names, job titles, placement, dates, leave allowances). Revoking
--    the table privilege also revokes every column privilege, so the
--    GRANT list below is the complete readable set.
--
-- 2. employee_private_fields(company, ids) — the ONE session path to the
--    sensitive columns. DEFINER, so it can read them; it returns rows
--    only for the organisation the caller is acting in (or staff), and
--    blanks every HR field unless the caller holds hr.sensitive.read
--    (organisation owner/admin, HR manager) or is staff. leave_token
--    (the employee's no-login leave link) is returned to anyone who may
--    manage leave links (people.write) as well as HR. Everyone else gets
--    the row id with nulls and hr_visible = false.
--
-- 3. employee_records_sensitive_write_guard — a JWT caller may change a
--    sensitive column only with hr.sensitive.write (or as staff). Today
--    only client_admin (→ organisation_admin, which holds it) may write
--    the table at all, so this refuses nothing that works; it stops a
--    later widening of the write policy from letting someone overwrite
--    salary or NI data they cannot read. SECURITY INVOKER keyed on
--    current_user (088/093): the service role, the SQL editor and
--    DEFINER functions are unaffected. salary_currency / pay_frequency /
--    leave_token carry column defaults, so an INSERT is judged only on
--    the columns without one.
-- ═══════════════════════════════════════════════════════════════════

REVOKE SELECT ON public.employee_records FROM anon, authenticated;

GRANT SELECT (
  id, company_id, full_name, email, phone, employee_number, job_title, department,
  employment_type, status, start_date, end_date, probation_end, line_manager,
  work_location, contract_hours, annual_leave_allowance, sick_day_allowance,
  leave_year_type, leave_year_start_month, leave_year_start_day,
  data_consent_at, sensitive_data_redacted, created_at, updated_at,
  source_candidate_id, person_id, department_id, site_id
) ON public.employee_records TO authenticated;

-- ─── The gated read ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.employee_private_fields(p_company uuid, p_ids uuid[] DEFAULT NULL)
RETURNS TABLE (id uuid, hr_visible boolean,
               salary numeric, salary_currency text, pay_frequency text,
               date_of_birth date, gender text, ethnicity text, nationality text, disability_status text,
               ni_number text, tax_code text,
               emergency_name text, emergency_phone text, emergency_relation text,
               address text, notes text, leave_token text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE hr boolean; lt boolean;
BEGIN
  IF p_company IS NULL OR auth.uid() IS NULL
     OR NOT (p_company = public.my_company_id() OR public.is_tps_staff()) THEN
    RETURN;
  END IF;
  hr := public.is_tps_staff() OR public.has_capability(p_company, 'hr.sensitive.read');
  lt := hr OR public.has_capability(p_company, 'people.write');
  RETURN QUERY
    SELECT e.id, hr,
           CASE WHEN hr THEN e.salary END, CASE WHEN hr THEN e.salary_currency END, CASE WHEN hr THEN e.pay_frequency END,
           CASE WHEN hr THEN e.date_of_birth END, CASE WHEN hr THEN e.gender END, CASE WHEN hr THEN e.ethnicity END,
           CASE WHEN hr THEN e.nationality END, CASE WHEN hr THEN e.disability_status END,
           CASE WHEN hr THEN e.ni_number END, CASE WHEN hr THEN e.tax_code END,
           CASE WHEN hr THEN e.emergency_name END, CASE WHEN hr THEN e.emergency_phone END, CASE WHEN hr THEN e.emergency_relation END,
           CASE WHEN hr THEN e.address END, CASE WHEN hr THEN e.notes END,
           CASE WHEN lt THEN e.leave_token END
      FROM employee_records e
     WHERE e.company_id = p_company
       AND (p_ids IS NULL OR e.id = ANY (p_ids));
END
$$;
REVOKE ALL ON FUNCTION public.employee_private_fields(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.employee_private_fields(uuid, uuid[]) TO authenticated;

-- ─── The write guard ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.employee_records_sensitive_write_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE touched boolean;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    touched := num_nonnulls(NEW.salary, NEW.date_of_birth, NEW.gender, NEW.ethnicity, NEW.nationality,
                            NEW.disability_status, NEW.ni_number, NEW.tax_code, NEW.emergency_name,
                            NEW.emergency_phone, NEW.emergency_relation, NEW.address, NEW.notes) > 0;
  ELSE
    touched := (NEW.salary, NEW.salary_currency, NEW.pay_frequency, NEW.date_of_birth, NEW.gender,
                NEW.ethnicity, NEW.nationality, NEW.disability_status, NEW.ni_number, NEW.tax_code,
                NEW.emergency_name, NEW.emergency_phone, NEW.emergency_relation, NEW.address, NEW.notes,
                NEW.leave_token)
       IS DISTINCT FROM
               (OLD.salary, OLD.salary_currency, OLD.pay_frequency, OLD.date_of_birth, OLD.gender,
                OLD.ethnicity, OLD.nationality, OLD.disability_status, OLD.ni_number, OLD.tax_code,
                OLD.emergency_name, OLD.emergency_phone, OLD.emergency_relation, OLD.address, OLD.notes,
                OLD.leave_token);
  END IF;
  IF touched AND NOT (public.is_tps_staff() OR public.has_capability(NEW.company_id, 'hr.sensitive.write')) THEN
    RAISE EXCEPTION 'You do not have permission to change sensitive HR details' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS employee_records_sensitive_write_guard ON public.employee_records;
CREATE TRIGGER employee_records_sensitive_write_guard
  BEFORE INSERT OR UPDATE ON public.employee_records
  FOR EACH ROW EXECUTE FUNCTION public.employee_records_sensitive_write_guard();
