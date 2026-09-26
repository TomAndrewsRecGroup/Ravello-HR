-- ═══════════════════════════════════════════════════════════════════
-- 118: Core-OS 360 Phase 1 — sites, departments, people (2026-09-26)
-- ═══════════════════════════════════════════════════════════════════
--
-- SITES. hs_sites (0 rows) already carries the FK from every H&S table,
-- so it is EXTENDED, not replaced, and `sites` is a security_invoker view
-- over it using the organisation vocabulary. Same pattern as
-- companies/organisations in 117.
--
-- DEPARTMENTS. One table for departments AND operational areas (`kind`),
-- nestable (Plant → Production), optionally tied to a site.
--
-- PEOPLE. One identity for anyone the platform knows about, with or
-- without a login. employee_records, candidates and athletes keep their
-- rows and their behaviour; each gains a nullable person_id, backfilled
-- here and kept filled by BEFORE INSERT triggers that can never fail the
-- insert (the referral pipeline writes candidates every hour; a person
-- link is worth nothing next to a lost applicant). A forced merge of the
-- three tables is explicitly NOT done in Phase 1.
--
-- WHY PEOPLE RLS IS DERIVATIVE. A candidate a client has not been shown
-- (approved_for_client = false) must stay invisible as a person too. So a
-- client sees a person when they can see a linked employee, candidate or
-- athlete row (the subqueries run under the caller's own RLS), or when
-- the person is one of their own workforce and they hold people.read.
-- Sensitive HR fields (salary, NI, health, diversity) stay on
-- employee_records; people carries identity and placement only.
--
-- CROSS-TENANT REFERENCES. A site, department, manager or person pointing
-- at another organisation's row would be an integrity leak even without a
-- read leak, so same-organisation is enforced by trigger on every link.

-- ─── 1. Sites ─────────────────────────────────────────────────────────

ALTER TABLE public.hs_sites
  ADD COLUMN IF NOT EXISTS site_code       text CHECK (length(site_code) <= 40),
  ADD COLUMN IF NOT EXISTS site_type       text NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS country         text NOT NULL DEFAULT 'United Kingdom' CHECK (length(country) <= 80),
  ADD COLUMN IF NOT EXISTS latitude        numeric(9,6) CHECK (latitude BETWEEN -90 AND 90),
  ADD COLUMN IF NOT EXISTS longitude       numeric(9,6) CHECK (longitude BETWEEN -180 AND 180),
  ADD COLUMN IF NOT EXISTS operating_hours jsonb;
DO $$ BEGIN
  ALTER TABLE public.hs_sites ADD CONSTRAINT hs_sites_site_type_check CHECK (site_type IN (
    'quarry','cement_plant','concrete_plant','office','warehouse','workshop','construction_site',
    'distribution_centre','retail','factory','depot','laboratory','other'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS hs_sites_code_unique ON public.hs_sites (company_id, lower(site_code)) WHERE site_code IS NOT NULL;

-- ─── 2. Departments / operational areas ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.departments (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  site_id              uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  parent_department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  kind                 text NOT NULL DEFAULT 'department' CHECK (kind IN ('department','operational_area')),
  name                 text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 150),
  code                 text CHECK (length(code) <= 40),
  active               boolean NOT NULL DEFAULT true,
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  CHECK (parent_department_id IS DISTINCT FROM id)
);
CREATE INDEX IF NOT EXISTS departments_company_idx ON public.departments (company_id);
CREATE INDEX IF NOT EXISTS departments_site_idx ON public.departments (site_id) WHERE site_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS departments_name_unique ON public.departments
  (company_id, COALESCE(site_id, '00000000-0000-0000-0000-000000000000'::uuid),
   COALESCE(parent_department_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
DROP TRIGGER IF EXISTS departments_updated_at ON public.departments;
CREATE TRIGGER departments_updated_at BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── 3. People ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.people (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  full_name         text NOT NULL CHECK (length(btrim(full_name)) BETWEEN 1 AND 300),
  first_name        text CHECK (length(first_name) <= 150),
  last_name         text CHECK (length(last_name) <= 150),
  preferred_name    text CHECK (length(preferred_name) <= 150),
  email             text CHECK (length(email) <= 320),
  phone             text CHECK (length(phone) <= 60),
  worker_type       text NOT NULL CHECK (worker_type IN
                      ('employee','candidate','contractor','consultant','temporary_worker','athlete','former_employee')),
  employment_status text CHECK (employment_status IN ('prospective','active','on_leave','left')),
  job_title         text CHECK (length(job_title) <= 200),
  department_id     uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  site_id           uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  manager_id        uuid REFERENCES public.people(id) ON DELETE SET NULL,
  start_date        date,
  end_date          date,
  employee_number   text CHECK (length(employee_number) <= 60),
  user_id           uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  active_status     text NOT NULL DEFAULT 'active' CHECK (active_status IN ('active','inactive','archived')),
  created_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (manager_id IS DISTINCT FROM id),
  CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS people_company_idx ON public.people (company_id, worker_type);
CREATE INDEX IF NOT EXISTS people_email_idx ON public.people (company_id, lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS people_department_idx ON public.people (department_id) WHERE department_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS people_site_idx ON public.people (site_id) WHERE site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS people_manager_idx ON public.people (manager_id) WHERE manager_id IS NOT NULL;
DROP TRIGGER IF EXISTS people_updated_at ON public.people;
CREATE TRIGGER people_updated_at BEFORE UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Name parts are derived best-effort; full_name stays authoritative
-- (splitting "Mary Anne de Souza" is not something to be confident about).
CREATE OR REPLACE FUNCTION public.people_fill_names()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.full_name := btrim(NEW.full_name);
  IF NEW.first_name IS NULL AND position(' ' IN NEW.full_name) > 0 THEN
    NEW.first_name := split_part(NEW.full_name, ' ', 1);
    NEW.last_name  := COALESCE(NEW.last_name, btrim(substr(NEW.full_name, length(NEW.first_name) + 1)));
  ELSIF NEW.first_name IS NULL THEN
    NEW.first_name := NEW.full_name;
  END IF;
  NEW.email := NULLIF(lower(btrim(NEW.email)), '');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS people_fill_names ON public.people;
CREATE TRIGGER people_fill_names BEFORE INSERT OR UPDATE OF full_name, first_name, email ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.people_fill_names();

-- ─── 4. Placement columns that point at people ──────────────────────

ALTER TABLE public.hs_sites
  ADD COLUMN IF NOT EXISTS site_manager_id uuid REFERENCES public.people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hse_lead_id     uuid REFERENCES public.people(id) ON DELETE SET NULL;
ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS manager_person_id uuid REFERENCES public.people(id) ON DELETE SET NULL;
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS primary_contact_id uuid REFERENCES public.people(id) ON DELETE SET NULL;

CREATE OR REPLACE VIEW public.sites WITH (security_invoker = true) AS
SELECT s.id, s.company_id AS organisation_id, s.name, s.site_code, s.site_type,
       s.address, s.postcode, s.country, s.latitude, s.longitude, s.operating_hours,
       s.site_manager_id, s.hse_lead_id,
       CASE WHEN s.active THEN 'active' ELSE 'inactive' END AS active_status,
       s.created_by, s.created_at, s.updated_at
  FROM public.hs_sites s;
REVOKE ALL ON public.sites FROM anon;
GRANT SELECT ON public.sites TO authenticated;

-- ─── 5. Same-organisation integrity ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.assert_same_org(p_company uuid, p_table text, p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE other uuid;
BEGIN
  IF p_id IS NULL THEN RETURN; END IF;
  EXECUTE format('SELECT company_id FROM public.%I WHERE id = $1', p_table) INTO other USING p_id;
  IF other IS DISTINCT FROM p_company THEN
    RAISE EXCEPTION '% % belongs to a different organisation', p_table, p_id USING ERRCODE = '23514';
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.assert_same_org(uuid, text, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.org_links_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'hs_sites' THEN
    PERFORM public.assert_same_org(NEW.company_id, 'people', NEW.site_manager_id);
    PERFORM public.assert_same_org(NEW.company_id, 'people', NEW.hse_lead_id);
  ELSIF TG_TABLE_NAME = 'departments' THEN
    PERFORM public.assert_same_org(NEW.company_id, 'hs_sites', NEW.site_id);
    PERFORM public.assert_same_org(NEW.company_id, 'departments', NEW.parent_department_id);
    PERFORM public.assert_same_org(NEW.company_id, 'people', NEW.manager_person_id);
  ELSIF TG_TABLE_NAME = 'people' THEN
    PERFORM public.assert_same_org(NEW.company_id, 'hs_sites', NEW.site_id);
    PERFORM public.assert_same_org(NEW.company_id, 'departments', NEW.department_id);
    PERFORM public.assert_same_org(NEW.company_id, 'people', NEW.manager_id);
  ELSIF TG_TABLE_NAME = 'companies' THEN
    PERFORM public.assert_same_org(NEW.id, 'people', NEW.primary_contact_id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.org_links_check() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS hs_sites_org_links ON public.hs_sites;
CREATE TRIGGER hs_sites_org_links BEFORE INSERT OR UPDATE OF company_id, site_manager_id, hse_lead_id ON public.hs_sites
  FOR EACH ROW EXECUTE FUNCTION public.org_links_check();
DROP TRIGGER IF EXISTS departments_org_links ON public.departments;
CREATE TRIGGER departments_org_links BEFORE INSERT OR UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.org_links_check();
DROP TRIGGER IF EXISTS people_org_links ON public.people;
CREATE TRIGGER people_org_links BEFORE INSERT OR UPDATE OF company_id, site_id, department_id, manager_id ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.org_links_check();
DROP TRIGGER IF EXISTS companies_org_links ON public.companies;
CREATE TRIGGER companies_org_links BEFORE UPDATE OF primary_contact_id ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.org_links_check();

-- ─── 6. Links from the existing identity tables ─────────────────────

ALTER TABLE public.employee_records ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id) ON DELETE SET NULL;
ALTER TABLE public.candidates       ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id) ON DELETE SET NULL;
ALTER TABLE public.athletes         ADD COLUMN IF NOT EXISTS person_id uuid REFERENCES public.people(id) ON DELETE SET NULL;
ALTER TABLE public.employee_records ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;
ALTER TABLE public.employee_records ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS employee_records_person_idx ON public.employee_records (person_id) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS candidates_person_idx ON public.candidates (person_id) WHERE person_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS athletes_person_idx ON public.athletes (person_id) WHERE person_id IS NOT NULL;

-- Find the organisation's person with this email, or create one. Email
-- match within ONE organisation only — never across tenants.
CREATE OR REPLACE FUNCTION public.person_find_or_create(
  p_company uuid, p_full_name text, p_email text, p_phone text, p_worker_type text, p_user uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE pid uuid; e text := NULLIF(lower(btrim(p_email)), '');
BEGIN
  IF p_user IS NOT NULL THEN
    SELECT id INTO pid FROM people WHERE user_id = p_user;
    IF pid IS NOT NULL THEN RETURN pid; END IF;
  END IF;
  IF e IS NOT NULL THEN
    SELECT id INTO pid FROM people WHERE company_id = p_company AND email = e ORDER BY created_at LIMIT 1;
  END IF;
  IF pid IS NULL THEN
    INSERT INTO people (company_id, full_name, email, phone, worker_type,
                        employment_status, user_id)
    VALUES (p_company, COALESCE(NULLIF(btrim(p_full_name), ''), e, 'Unnamed'), e, p_phone, p_worker_type,
            CASE p_worker_type WHEN 'candidate' THEN 'prospective' WHEN 'athlete' THEN 'prospective'
                               WHEN 'former_employee' THEN 'left' ELSE 'active' END,
            p_user)
    RETURNING id INTO pid;
  ELSIF p_user IS NOT NULL THEN
    UPDATE people SET user_id = p_user WHERE id = pid AND user_id IS NULL;
  END IF;
  RETURN pid;
END $$;
REVOKE ALL ON FUNCTION public.person_find_or_create(uuid, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;

-- BEFORE INSERT on the three identity tables. Never raises: on any error
-- the row is inserted unlinked and a WARNING is logged.
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
      UPDATE people SET worker_type = 'employee', employment_status = 'active',
                        job_title = COALESCE(NEW.job_title, job_title),
                        start_date = COALESCE(NEW.start_date, start_date),
                        employee_number = COALESCE(NEW.employee_number, employee_number)
       WHERE id = NEW.person_id AND worker_type IN ('candidate','employee','former_employee');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'person_link_row(%): % — row inserted unlinked', TG_TABLE_NAME, SQLERRM;
    NEW.person_id := NULL;
  END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.person_link_row() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS candidates_person_link ON public.candidates;
CREATE TRIGGER candidates_person_link BEFORE INSERT ON public.candidates
  FOR EACH ROW EXECUTE FUNCTION public.person_link_row();
DROP TRIGGER IF EXISTS athletes_person_link ON public.athletes;
CREATE TRIGGER athletes_person_link BEFORE INSERT ON public.athletes
  FOR EACH ROW EXECUTE FUNCTION public.person_link_row();
DROP TRIGGER IF EXISTS employee_records_person_link ON public.employee_records;
CREATE TRIGGER employee_records_person_link BEFORE INSERT ON public.employee_records
  FOR EACH ROW EXECUTE FUNCTION public.person_link_row();

-- A leaver keeps their person, marked as such.
CREATE OR REPLACE FUNCTION public.person_employee_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.person_id IS NOT NULL AND NEW.status IS DISTINCT FROM OLD.status THEN
    BEGIN
      UPDATE people SET
        worker_type = CASE WHEN NEW.status::text = 'terminated' THEN 'former_employee' ELSE 'employee' END,
        employment_status = CASE WHEN NEW.status::text = 'terminated' THEN 'left'
                                 WHEN NEW.status::text = 'on_leave' THEN 'on_leave' ELSE 'active' END,
        end_date = CASE WHEN NEW.status::text = 'terminated' THEN COALESCE(NEW.end_date, current_date) ELSE end_date END
       WHERE id = NEW.person_id;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'person_employee_status: %', SQLERRM;
    END;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.person_employee_status() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS employee_records_person_status ON public.employee_records;
CREATE TRIGGER employee_records_person_status AFTER UPDATE OF status ON public.employee_records
  FOR EACH ROW EXECUTE FUNCTION public.person_employee_status();

-- A login with a company is linked to a person in that company. Never
-- raises (sign-up and invites must not fail on it).
CREATE OR REPLACE FUNCTION public.person_link_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.company_id IS NOT NULL AND NEW.role::text NOT IN ('tps_admin','tps_client','hs_provider') THEN
    BEGIN
      PERFORM public.person_find_or_create(NEW.company_id, NEW.full_name, NEW.email, NULL,
        CASE WHEN EXISTS (SELECT 1 FROM companies WHERE id = NEW.company_id AND organisation_type = 'consultancy')
             THEN 'consultant' ELSE 'employee' END, NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'person_link_profile: %', SQLERRM;
    END;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.person_link_profile() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS profiles_person_link ON public.profiles;
CREATE TRIGGER profiles_person_link AFTER INSERT OR UPDATE OF company_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.person_link_profile();

-- ─── 7. Backfill (ids and rows untouched; only person_id is set) ────

DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id, company_id, full_name, email, phone FROM public.athletes WHERE person_id IS NULL ORDER BY created_at LOOP
    UPDATE public.athletes SET person_id = public.person_find_or_create(r.company_id, r.full_name, r.email, r.phone, 'athlete')
     WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id, company_id, full_name, email, phone FROM public.candidates WHERE person_id IS NULL ORDER BY created_at LOOP
    UPDATE public.candidates SET person_id = public.person_find_or_create(r.company_id, r.full_name, r.email, r.phone, 'candidate')
     WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id, company_id, full_name, email, phone, source_candidate_id FROM public.employee_records WHERE person_id IS NULL LOOP
    UPDATE public.employee_records SET person_id = COALESCE(
        (SELECT person_id FROM public.candidates WHERE id = r.source_candidate_id AND company_id = r.company_id),
        public.person_find_or_create(r.company_id, r.full_name, r.email, r.phone, 'employee'))
     WHERE id = r.id;
  END LOOP;
  FOR r IN SELECT id, company_id, full_name, email FROM public.profiles
            WHERE company_id IS NOT NULL AND role::text NOT IN ('tps_admin','tps_client','hs_provider') LOOP
    PERFORM public.person_find_or_create(r.company_id, r.full_name, r.email, NULL, 'employee', r.id);
  END LOOP;
END $$;

-- ─── 8. RLS ───────────────────────────────────────────────────────────

-- Sites: clients already read their own; now an organisation that holds
-- site.manage may maintain them too (staff keep ALL).
DROP POLICY IF EXISTS hs_sites_org_manage ON public.hs_sites;
CREATE POLICY hs_sites_org_manage ON public.hs_sites
  FOR ALL TO authenticated
  USING (company_id = (SELECT public.my_company_id()) AND public.has_capability(company_id, 'site.manage'))
  WITH CHECK (company_id = (SELECT public.my_company_id()) AND public.has_capability(company_id, 'site.manage'));

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS departments_staff_all ON public.departments;
CREATE POLICY departments_staff_all ON public.departments
  FOR ALL TO authenticated USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS departments_org_read ON public.departments;
CREATE POLICY departments_org_read ON public.departments
  FOR SELECT TO authenticated USING (company_id = (SELECT public.my_company_id()));
DROP POLICY IF EXISTS departments_org_manage ON public.departments;
CREATE POLICY departments_org_manage ON public.departments
  FOR ALL TO authenticated
  USING (company_id = (SELECT public.my_company_id()) AND public.has_capability(company_id, 'site.manage'))
  WITH CHECK (company_id = (SELECT public.my_company_id()) AND public.has_capability(company_id, 'site.manage'));
SELECT public.apply_write_guard('public.departments');

ALTER TABLE public.people ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS people_staff_all ON public.people;
CREATE POLICY people_staff_all ON public.people
  FOR ALL TO authenticated USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS people_read ON public.people;
CREATE POLICY people_read ON public.people
  FOR SELECT TO authenticated
  USING (
    user_id = (SELECT auth.uid())
    OR (company_id = (SELECT public.my_company_id())
        AND worker_type IN ('employee','contractor','consultant','temporary_worker','former_employee')
        AND public.has_capability(company_id, 'people.read'))
    OR EXISTS (SELECT 1 FROM public.employee_records e WHERE e.person_id = people.id)
    OR EXISTS (SELECT 1 FROM public.candidates c WHERE c.person_id = people.id)
    OR EXISTS (SELECT 1 FROM public.athletes a WHERE a.person_id = people.id));
DROP POLICY IF EXISTS people_org_write ON public.people;
CREATE POLICY people_org_write ON public.people
  FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id()) AND public.has_capability(company_id, 'people.write'));
DROP POLICY IF EXISTS people_org_update ON public.people;
CREATE POLICY people_org_update ON public.people
  FOR UPDATE TO authenticated
  USING (company_id = (SELECT public.my_company_id()) AND public.has_capability(company_id, 'people.write'))
  WITH CHECK (company_id = (SELECT public.my_company_id()) AND public.has_capability(company_id, 'people.write'));
DROP POLICY IF EXISTS people_org_delete ON public.people;
CREATE POLICY people_org_delete ON public.people
  FOR DELETE TO authenticated
  USING (company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user())
         AND public.has_capability(company_id, 'people.write'));
SELECT public.apply_write_guard('public.people');

-- ─── 9. Audit ─────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS people_audit ON public.people;
CREATE TRIGGER people_audit AFTER INSERT OR UPDATE OR DELETE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('person', 'company_id', 'full_name', 'worker_type', 'employment_status',
    'job_title', 'department_id', 'site_id', 'manager_id', 'user_id', 'active_status');
DROP TRIGGER IF EXISTS hs_sites_audit ON public.hs_sites;
CREATE TRIGGER hs_sites_audit AFTER INSERT OR UPDATE OR DELETE ON public.hs_sites
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('site', 'company_id', 'name', 'site_code', 'site_type', 'active',
    'site_manager_id', 'hse_lead_id');
DROP TRIGGER IF EXISTS departments_audit ON public.departments;
CREATE TRIGGER departments_audit AFTER INSERT OR UPDATE OR DELETE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('department', 'company_id', 'name', 'kind', 'site_id',
    'parent_department_id', 'manager_person_id', 'active');
