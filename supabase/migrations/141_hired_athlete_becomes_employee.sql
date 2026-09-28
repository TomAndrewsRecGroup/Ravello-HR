-- ═══════════════════════════════════════════════════════════════════
-- 141: a hired athlete becomes an employee (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- Found by the Phase 3 QA probe (QA 2), severity HIGH (recruitment →
-- onboarding → readiness broken for one route in). An Athletes To
-- Industry athlete who applies and is hired is correctly ONE person
-- (athlete → candidate → employee share the person, matched by email),
-- but 118's person_link_row promoted to 'employee' only people whose
-- worker_type was candidate, employee or former_employee. The athlete
-- stayed 'athlete' — and every workforce list (136 workforce_readiness,
-- 138 workforce_matrix) includes only employee / contractor / consultant
-- / temporary_worker, so a hired athlete never appeared on Safe to
-- Deploy. Their own profile still worked.
--
-- The same function, with 'athlete' in the list. Live data: 0 employee
-- records are linked to an athlete person, so there is nothing to
-- backfill (checked before applying).
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.person_link_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.person_id IS NOT NULL THEN RETURN NEW; END IF;
  BEGIN
    IF TG_TABLE_NAME = 'candidates' THEN
      NEW.person_id := public.person_find_or_create(NEW.company_id, NEW.full_name, NEW.email, NEW.phone, 'candidate');
    ELSIF TG_TABLE_NAME = 'athletes' THEN
      NEW.person_id := public.person_find_or_create(NEW.company_id, NEW.full_name, NEW.email, NEW.phone, 'athlete');
    ELSIF TG_TABLE_NAME = 'employee_records' THEN
      -- A hire keeps the candidate's identity: candidate → employee.
      IF NEW.source_candidate_id IS NOT NULL THEN
        SELECT person_id INTO NEW.person_id FROM candidates
         WHERE id = NEW.source_candidate_id AND company_id = NEW.company_id;
      END IF;
      IF NEW.person_id IS NULL THEN
        NEW.person_id := public.person_find_or_create(NEW.company_id, NEW.full_name, NEW.email, NEW.phone, 'employee');
      END IF;
      -- 141: an athlete who is hired is an employee too.
      UPDATE people SET worker_type = 'employee', employment_status = 'active',
                        job_title = COALESCE(NEW.job_title, job_title),
                        start_date = COALESCE(NEW.start_date, start_date),
                        employee_number = COALESCE(NEW.employee_number, employee_number)
       WHERE id = NEW.person_id AND worker_type IN ('candidate','athlete','employee','former_employee');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'person_link_row(%): % — row inserted unlinked', TG_TABLE_NAME, SQLERRM;
    NEW.person_id := NULL;
  END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.person_link_row() FROM PUBLIC, anon, authenticated;
