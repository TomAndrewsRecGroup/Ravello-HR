-- ═══════════════════════════════════════════════════════════════════
-- 132: Core-OS 360 Phase 3 — workforce foundation (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- Plan: docs/CORE_OS_360_PHASE3_PLAN.md §1-3, §8.
--
-- 1. Capabilities for workforce compliance, verification, competency,
--    occupational health and deployment exceptions; one new access role
--    (occupational_health_advisor).
-- 2. people: lifecycle_status (employment ≠ compliance), engagement_type
--    (permanent, contractor, agency…), primary_role_id, contractor_company.
--    worker_type is unchanged: it is the CONTEXT (candidate, athlete…).
-- 3. person_private: personal email / phone, hr.sensitive only.
-- 4. person_visible(person): the ONE visibility rule every person-keyed
--    workforce table uses — org-wide with workforce.read, else the
--    person's own manager or the manager of the site/department they are
--    assigned to, else the person themselves, else staff.
-- 5. job_roles (named so because access_roles already means PERMISSION
--    roles) and role_assignments (person × role × site/department, dated,
--    several may be active and their requirements combine).
--
-- Table names keep this repo's `company_id` (organisation_id ≡ company_id,
-- 117), so assert_same_org, audit_row and every helper apply unchanged.
-- ═══════════════════════════════════════════════════════════════════

-- ─── 1. Capabilities and the occupational health role ───────────────

INSERT INTO public.access_roles (key, name, scope, legacy_role, read_only, consultancy_grantable) VALUES
  ('occupational_health_advisor', 'Occupational Health Advisor', 'organisation', 'client_editor', false, false)
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, scope = EXCLUDED.scope, legacy_role = EXCLUDED.legacy_role,
  read_only = EXCLUDED.read_only, consultancy_grantable = EXCLUDED.consultancy_grantable;

INSERT INTO public.access_capabilities (key, description, sensitive) VALUES
  ('workforce.read',                    'See workforce compliance for everyone in the organisation', false),
  ('workforce.manage',                  'Maintain roles, requirements, assignments and training catalogues', false),
  ('workforce.verify_safety_critical',  'Verify evidence that satisfies a safety-critical requirement', false),
  ('training.verify',                   'Verify training records and certificates', false),
  ('competency.assess',                 'Record competency assessments', false),
  ('competency.verify',                 'Verify competency assessments, suspend and reinstate', false),
  ('occupational_health.summary.read',  'See occupational health outcomes and restrictions (no clinical detail)', true),
  ('occupational_health.clinical.read', 'See clinical occupational health records', true),
  ('occupational_health.manage',        'Record occupational health requirements and outcomes', true),
  ('deployment.exception.approve',      'Approve a time-limited exception to a deployment requirement', false)
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description, sensitive = EXCLUDED.sensitive;

INSERT INTO public.access_role_capabilities (role_key, capability_key)
SELECT r, c FROM (VALUES
  ('workforce.read',                    ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','organisation_editor','hse_manager','hse_advisor','hr_manager','read_only','occupational_health_advisor']),
  ('workforce.manage',                  ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','hse_manager','hr_manager']),
  ('workforce.verify_safety_critical',  ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','hse_manager']),
  ('training.verify',                   ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','hse_manager','hse_advisor','hr_manager','site_manager','department_manager']),
  ('competency.assess',                 ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','hse_manager','hse_advisor','site_manager','department_manager']),
  ('competency.verify',                 ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','hse_manager']),
  ('occupational_health.summary.read',  ARRAY['platform_super_admin','platform_staff','organisation_owner','organisation_admin','hse_manager','hr_manager','occupational_health_advisor']),
  ('occupational_health.clinical.read', ARRAY['occupational_health_advisor']),
  ('occupational_health.manage',        ARRAY['platform_super_admin','platform_staff','organisation_owner','organisation_admin','hse_manager','occupational_health_advisor']),
  ('deployment.exception.approve',      ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant','organisation_owner','organisation_admin','hse_manager'])
) AS m(c, roles), unnest(m.roles) AS r
ON CONFLICT DO NOTHING;

-- The advisor's baseline (a grant, never a home role today).
INSERT INTO public.access_role_capabilities (role_key, capability_key)
SELECT 'occupational_health_advisor', c
  FROM unnest(ARRAY['organisation.read','site.read','people.read','hazard.report']) AS c
ON CONFLICT DO NOTHING;

-- Clinical access is NEVER implied by being staff. has_capability() says
-- yes to every staff member for everything; this one does not: it needs
-- a real grant (or home role) that holds the capability. Staff who run
-- the occupational health service are granted occupational_health_advisor
-- on the client like anyone else.
CREATE OR REPLACE FUNCTION public.has_explicit_capability(p_org uuid, p_cap text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND p_org IS NOT NULL AND EXISTS (
    SELECT 1 FROM access_role_capabilities rc
     WHERE rc.capability_key = p_cap
       AND rc.role_key IN (
         SELECT public.my_home_role_key()
          WHERE p_org = (SELECT company_id FROM profiles WHERE id = auth.uid())
         UNION ALL
         SELECT g.role_key FROM user_organisation_access g
          WHERE g.user_id = auth.uid() AND g.organisation_id = p_org
            AND g.active_status = 'active' AND g.valid_from <= now()
            AND (g.valid_until IS NULL OR g.valid_until > now())))
$$;
REVOKE ALL ON FUNCTION public.has_explicit_capability(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_explicit_capability(uuid, text) TO authenticated, service_role;

-- ─── 2. people: lifecycle and engagement ────────────────────────────

ALTER TABLE public.people
  ADD COLUMN IF NOT EXISTS lifecycle_status   text,
  ADD COLUMN IF NOT EXISTS engagement_type    text,
  ADD COLUMN IF NOT EXISTS primary_role_id    uuid,
  ADD COLUMN IF NOT EXISTS contractor_company text CHECK (length(contractor_company) <= 200);

ALTER TABLE public.people DROP CONSTRAINT IF EXISTS people_lifecycle_status_check;
ALTER TABLE public.people ADD CONSTRAINT people_lifecycle_status_check CHECK (lifecycle_status IN
  ('prospect','candidate','offer','pre_employment','active','leave_of_absence','notice','leaver','former_worker','archived'));
ALTER TABLE public.people DROP CONSTRAINT IF EXISTS people_engagement_type_check;
ALTER TABLE public.people ADD CONSTRAINT people_engagement_type_check CHECK (engagement_type IN
  ('permanent','fixed_term','contractor','agency','casual','apprentice','consultant','volunteer','trainee','temporary'));

-- The lifecycle a context implies. Used to fill a NULL lifecycle and to
-- follow the context when it changes; an explicit lifecycle written in
-- the same statement always wins.
CREATE OR REPLACE FUNCTION public.person_default_lifecycle(p_worker_type text, p_employment_status text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p_worker_type = 'candidate'       THEN 'candidate'
    WHEN p_worker_type = 'athlete'         THEN 'prospect'
    WHEN p_worker_type = 'former_employee' THEN 'former_worker'
    WHEN p_employment_status = 'left'      THEN 'leaver'
    WHEN p_employment_status = 'on_leave'  THEN 'leave_of_absence'
    WHEN p_employment_status = 'prospective' THEN 'pre_employment'
    ELSE 'active' END
$$;

CREATE OR REPLACE FUNCTION public.people_lifecycle_fill()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.lifecycle_status := COALESCE(NEW.lifecycle_status,
      public.person_default_lifecycle(NEW.worker_type, NEW.employment_status));
  ELSIF (NEW.worker_type IS DISTINCT FROM OLD.worker_type OR NEW.employment_status IS DISTINCT FROM OLD.employment_status)
        AND NEW.lifecycle_status IS NOT DISTINCT FROM OLD.lifecycle_status THEN
    NEW.lifecycle_status := public.person_default_lifecycle(NEW.worker_type, NEW.employment_status);
  END IF;
  IF NEW.engagement_type IS NULL AND NEW.worker_type = 'contractor' THEN NEW.engagement_type := 'contractor'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS people_lifecycle_fill ON public.people;
CREATE TRIGGER people_lifecycle_fill BEFORE INSERT OR UPDATE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.people_lifecycle_fill();

UPDATE public.people SET lifecycle_status = public.person_default_lifecycle(worker_type, employment_status)
 WHERE lifecycle_status IS NULL;
ALTER TABLE public.people ALTER COLUMN lifecycle_status SET NOT NULL;
CREATE INDEX IF NOT EXISTS people_lifecycle_idx ON public.people (company_id, lifecycle_status);

-- ─── 3. person_private ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.person_private (
  person_id      uuid PRIMARY KEY REFERENCES public.people(id) ON DELETE CASCADE,
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  personal_email text CHECK (length(personal_email) <= 320),
  personal_phone text CHECK (length(personal_phone) <= 60),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.person_private_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  NEW.company_id := (SELECT company_id FROM people WHERE id = NEW.person_id);
  IF NEW.company_id IS NULL THEN RAISE EXCEPTION 'Unknown person' USING ERRCODE = '23503'; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.person_private_fill() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS person_private_fill ON public.person_private;
CREATE TRIGGER person_private_fill BEFORE INSERT OR UPDATE ON public.person_private
  FOR EACH ROW EXECUTE FUNCTION public.person_private_fill();

ALTER TABLE public.person_private ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS person_private_read ON public.person_private;
CREATE POLICY person_private_read ON public.person_private FOR SELECT TO authenticated
  USING ((SELECT public.is_tps_staff())
         OR (company_id = (SELECT public.my_company_id()) AND public.has_capability(company_id, 'hr.sensitive.read'))
         OR EXISTS (SELECT 1 FROM public.people p WHERE p.id = person_id AND p.user_id = (SELECT auth.uid())));
DROP POLICY IF EXISTS person_private_write ON public.person_private;
CREATE POLICY person_private_write ON public.person_private FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())
         OR (company_id = (SELECT public.my_company_id()) AND public.has_capability(company_id, 'hr.sensitive.write')))
  WITH CHECK ((SELECT public.is_tps_staff())
         OR (company_id = (SELECT public.my_company_id()) AND public.has_capability(company_id, 'hr.sensitive.write')));
SELECT public.apply_write_guard('public.person_private');

-- ─── 4. Visibility ──────────────────────────────────────────────────

-- The caller's own person record in an organisation.
CREATE OR REPLACE FUNCTION public.my_person_id(p_org uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT id FROM people WHERE user_id = auth.uid() AND company_id = p_org LIMIT 1
$$;
REVOKE ALL ON FUNCTION public.my_person_id(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_person_id(uuid) TO authenticated, service_role;

-- ─── 5. Job roles and assignments ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.job_roles (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title           text NOT NULL CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  department_id   uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  default_site_id uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  description     text CHECK (length(description) <= 4000),
  role_category   text CHECK (length(role_category) <= 100),
  safety_critical boolean NOT NULL DEFAULT false,
  active_status   text NOT NULL DEFAULT 'active' CHECK (active_status IN ('draft','active','inactive')),
  cloned_from_id  uuid REFERENCES public.job_roles(id) ON DELETE SET NULL,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS job_roles_company_idx ON public.job_roles (company_id, active_status);
CREATE UNIQUE INDEX IF NOT EXISTS job_roles_title_unique ON public.job_roles (company_id, lower(btrim(title)));
DROP TRIGGER IF EXISTS job_roles_updated_at ON public.job_roles;
CREATE TRIGGER job_roles_updated_at BEFORE UPDATE ON public.job_roles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.people DROP CONSTRAINT IF EXISTS people_primary_role_fk;
ALTER TABLE public.people ADD CONSTRAINT people_primary_role_fk
  FOREIGN KEY (primary_role_id) REFERENCES public.job_roles(id) ON DELETE SET NULL;

-- A hire can land on a role.
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS job_role_id uuid REFERENCES public.job_roles(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.role_assignments (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  person_id          uuid NOT NULL REFERENCES public.people(id) ON DELETE CASCADE,
  role_id            uuid NOT NULL REFERENCES public.job_roles(id) ON DELETE RESTRICT,
  site_id            uuid REFERENCES public.hs_sites(id) ON DELETE SET NULL,
  department_id      uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  primary_assignment boolean NOT NULL DEFAULT false,
  start_date         date NOT NULL DEFAULT current_date,
  end_date           date,
  assignment_status  text NOT NULL DEFAULT 'active' CHECK (assignment_status IN ('planned','active','ended')),
  ended_reason       text CHECK (length(ended_reason) <= 500),
  source_ref         text CHECK (length(source_ref) <= 200),
  created_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date IS NULL OR end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS role_assignments_person_idx ON public.role_assignments (person_id, assignment_status);
CREATE INDEX IF NOT EXISTS role_assignments_role_idx ON public.role_assignments (role_id) WHERE assignment_status = 'active';
CREATE INDEX IF NOT EXISTS role_assignments_site_idx ON public.role_assignments (site_id) WHERE site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS role_assignments_company_idx ON public.role_assignments (company_id);
-- One primary assignment at a time; a keyed source (a hire) runs once.
CREATE UNIQUE INDEX IF NOT EXISTS role_assignments_one_primary ON public.role_assignments (person_id)
  WHERE primary_assignment AND assignment_status <> 'ended';
CREATE UNIQUE INDEX IF NOT EXISTS role_assignments_source_unique ON public.role_assignments (company_id, source_ref);
DROP TRIGGER IF EXISTS role_assignments_updated_at ON public.role_assignments;
CREATE TRIGGER role_assignments_updated_at BEFORE UPDATE ON public.role_assignments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Every link on a workforce row stays inside its organisation, and an
-- ended assignment stays ended (history is never re-opened; reassign).
CREATE OR REPLACE FUNCTION public.workforce_links_check()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_TABLE_NAME = 'job_roles' THEN
    PERFORM public.assert_same_org(NEW.company_id, 'departments', NEW.department_id);
    PERFORM public.assert_same_org(NEW.company_id, 'hs_sites', NEW.default_site_id);
    PERFORM public.assert_same_org(NEW.company_id, 'job_roles', NEW.cloned_from_id);
  ELSIF TG_TABLE_NAME = 'role_assignments' THEN
    PERFORM public.assert_same_org(NEW.company_id, 'people', NEW.person_id);
    PERFORM public.assert_same_org(NEW.company_id, 'job_roles', NEW.role_id);
    PERFORM public.assert_same_org(NEW.company_id, 'hs_sites', NEW.site_id);
    PERFORM public.assert_same_org(NEW.company_id, 'departments', NEW.department_id);
    IF TG_OP = 'UPDATE' THEN
      IF OLD.assignment_status = 'ended' AND NEW.assignment_status <> 'ended' THEN
        RAISE EXCEPTION 'An ended assignment cannot be re-opened; create a new one' USING ERRCODE = '23514';
      END IF;
      IF (NEW.person_id, NEW.role_id, NEW.start_date) IS DISTINCT FROM (OLD.person_id, OLD.role_id, OLD.start_date)
         AND OLD.start_date <= current_date THEN
        RAISE EXCEPTION 'A started assignment keeps its person, role and start date; end it and create a new one'
          USING ERRCODE = '23514';
      END IF;
    END IF;
    IF NEW.assignment_status = 'ended' THEN
      NEW.end_date := COALESCE(NEW.end_date, current_date);
      NEW.primary_assignment := false;
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.workforce_links_check() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS job_roles_links ON public.job_roles;
CREATE TRIGGER job_roles_links BEFORE INSERT OR UPDATE ON public.job_roles FOR EACH ROW EXECUTE FUNCTION public.workforce_links_check();
DROP TRIGGER IF EXISTS role_assignments_links ON public.role_assignments;
CREATE TRIGGER role_assignments_links BEFORE INSERT OR UPDATE ON public.role_assignments FOR EACH ROW EXECUTE FUNCTION public.workforce_links_check();

-- May the caller see this person's workforce compliance? Only ever for
-- the organisation they are acting in (my_company_id), never several at
-- once — the rule 117 set for every tenant check.
CREATE OR REPLACE FUNCTION public.person_visible(p_person uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH p AS (SELECT id, company_id, manager_id, user_id FROM people WHERE id = p_person)
  SELECT COALESCE((
    SELECT public.is_tps_staff()
        OR p.user_id = auth.uid()
        OR (p.company_id = public.my_company_id() AND (
              public.has_capability(p.company_id, 'workforce.read')
           OR (me.id IS NOT NULL AND (
                 p.manager_id = me.id
              OR EXISTS (SELECT 1 FROM role_assignments a
                           LEFT JOIN hs_sites s ON s.id = a.site_id
                           LEFT JOIN departments d ON d.id = a.department_id
                          WHERE a.person_id = p.id AND a.assignment_status = 'active'
                            AND (s.site_manager_id = me.id OR d.manager_person_id = me.id))))))
      FROM p LEFT JOIN LATERAL (SELECT public.my_person_id(p.company_id) AS id) me ON true), false)
$$;

-- person_visible() reads role_assignments, so it is created after that table.
REVOKE ALL ON FUNCTION public.person_visible(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.person_visible(uuid) TO authenticated, service_role;

ALTER TABLE public.job_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS job_roles_staff_all ON public.job_roles;
CREATE POLICY job_roles_staff_all ON public.job_roles FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS job_roles_org_read ON public.job_roles;
CREATE POLICY job_roles_org_read ON public.job_roles FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));
DROP POLICY IF EXISTS job_roles_org_manage ON public.job_roles;
CREATE POLICY job_roles_org_manage ON public.job_roles FOR ALL TO authenticated
  USING (company_id = (SELECT public.my_company_id()) AND public.has_capability(company_id, 'workforce.manage'))
  WITH CHECK (company_id = (SELECT public.my_company_id()) AND public.has_capability(company_id, 'workforce.manage'));
SELECT public.apply_write_guard('public.job_roles');

ALTER TABLE public.role_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_assignments_read ON public.role_assignments;
CREATE POLICY role_assignments_read ON public.role_assignments FOR SELECT TO authenticated
  USING (public.person_visible(person_id));
DROP POLICY IF EXISTS role_assignments_manage ON public.role_assignments;
CREATE POLICY role_assignments_manage ON public.role_assignments FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())
         OR (company_id = (SELECT public.my_company_id()) AND public.has_capability(company_id, 'workforce.manage')))
  WITH CHECK ((SELECT public.is_tps_staff())
         OR (company_id = (SELECT public.my_company_id()) AND public.has_capability(company_id, 'workforce.manage')));
SELECT public.apply_write_guard('public.role_assignments');

-- ─── 6. Audit ───────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS people_audit ON public.people;
CREATE TRIGGER people_audit AFTER INSERT OR UPDATE OR DELETE ON public.people
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('person', 'company_id', 'full_name', 'worker_type', 'employment_status',
    'job_title', 'department_id', 'site_id', 'manager_id', 'user_id', 'active_status',
    'lifecycle_status', 'engagement_type', 'primary_role_id');
DROP TRIGGER IF EXISTS job_roles_audit ON public.job_roles;
CREATE TRIGGER job_roles_audit AFTER INSERT OR UPDATE OR DELETE ON public.job_roles
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('job_role', 'company_id', 'title', 'department_id', 'default_site_id',
    'role_category', 'safety_critical', 'active_status');
DROP TRIGGER IF EXISTS role_assignments_audit ON public.role_assignments;
CREATE TRIGGER role_assignments_audit AFTER INSERT OR UPDATE OR DELETE ON public.role_assignments
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('role_assignment', 'company_id', 'person_id', 'role_id', 'site_id',
    'department_id', 'primary_assignment', 'start_date', 'end_date', 'assignment_status');
