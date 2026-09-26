-- ═══════════════════════════════════════════════════════════════════
-- 117: Core-OS 360 Phase 1 — tenancy core (2026-09-26)
-- ═══════════════════════════════════════════════════════════════════
--
-- Organisation model, consultancy relationships, capability catalogue,
-- explicit cross-organisation access grants, the ACTIVE organisation,
-- a read-only write guard, the immutable audit trail, and the rewrite of
-- the 43 policies that bypassed the tenancy helpers.
--
-- WHY `companies` STAYS THE TABLE. 150+ files and every FK in the schema
-- say company_id. `organisations` is a security_invoker VIEW over
-- `companies`, which gains the organisation columns. organisation_id ≡
-- company_id, so no id, FK, row or policy moves. A later phase may swap
-- them (companies becomes the view) once nothing reads the old name.
--
-- WHY AN ACTIVE ORGANISATION, NOT WIDER POLICIES. A consultant (Laws
-- Safety) must reach many clients; a client must never reach another.
-- Rewriting ~140 policies to "company_id IN (everything I may see)"
-- would show several clients in one page load and let a record be
-- created against whichever client the form defaulted to. Instead:
--   * user_organisation_access records who MAY act in which org;
--   * user_active_organisation records which ONE they are acting in,
--     written only by set_active_organisation(), which checks the grant;
--   * my_company_id() returns that org ONLY while the grant is live, and
--     otherwise the home company. It re-checks on every call, so a
--     revoked or expired grant stops working on the next query, whatever
--     the browser still believes.
-- Every existing policy, storage policy and portal query therefore scopes
-- to exactly one tenant, the one the user can see named on screen.
--
-- WHY A RESTRICTIVE WRITE GUARD. Legacy client RLS lets any company
-- member write most tables; there is no read-only legacy role. A
-- read-only grant must not become an editor, so every client-writable
-- table gets three RESTRICTIVE policies (INSERT/UPDATE/DELETE) ANDed with
-- the existing permissive ones: session_can_write() is false only while
-- the caller is acting under a read-only grant. Home users, staff and the
-- service role are unaffected.
--
-- WHY tps_client IS REMOVED FROM 43 POLICIES. Those policies (onboarding,
-- offboarding, employee_records, leave, policy acknowledgements, calendar,
-- profiles…) inlined `role IN ('tps_admin','tps_client')` and so granted
-- the demo role cross-company read/write, while is_tps_staff(), the admin
-- app and every newer policy treat only tps_admin as staff. 0 tps_client
-- users exist (checked 2026-09-26), so this closes a latent grant and
-- changes nothing anyone uses. The rewrite is generated from the LIVE
-- pg_policies text, so each policy keeps its exact meaning otherwise.

-- ─── 1. Organisation columns on companies + the organisations view ───

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS legal_name             text CHECK (length(legal_name) <= 300),
  ADD COLUMN IF NOT EXISTS organisation_type      text NOT NULL DEFAULT 'direct_client',
  ADD COLUMN IF NOT EXISTS parent_organisation_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS company_number         text CHECK (length(company_number) <= 40),
  ADD COLUMN IF NOT EXISTS address_line1          text CHECK (length(address_line1) <= 300),
  ADD COLUMN IF NOT EXISTS address_line2          text CHECK (length(address_line2) <= 300),
  ADD COLUMN IF NOT EXISTS town                   text CHECK (length(town) <= 120),
  ADD COLUMN IF NOT EXISTS postcode               text CHECK (length(postcode) <= 20),
  ADD COLUMN IF NOT EXISTS country                text NOT NULL DEFAULT 'United Kingdom' CHECK (length(country) <= 80),
  ADD COLUMN IF NOT EXISTS updated_at             timestamptz NOT NULL DEFAULT now();

DO $$ BEGIN
  ALTER TABLE public.companies ADD CONSTRAINT companies_organisation_type_check
    CHECK (organisation_type IN ('platform_owner','consultancy','direct_client','subsidiary','group_company','business_unit'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.companies ADD CONSTRAINT companies_parent_not_self CHECK (parent_organisation_id IS DISTINCT FROM id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS companies_parent_idx ON public.companies (parent_organisation_id) WHERE parent_organisation_id IS NOT NULL;

-- Named to sort AFTER companies_guard_commercial, so the guard compares
-- the caller's own change and never sees this stamp.
DROP TRIGGER IF EXISTS companies_updated_at ON public.companies;
CREATE TRIGGER companies_updated_at BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE VIEW public.organisations WITH (security_invoker = true) AS
SELECT c.id, c.name, c.legal_name, c.organisation_type, c.parent_organisation_id,
       c.company_number, c.sector, c.size_band,
       c.address_line1, c.address_line2, c.town, c.postcode, c.country,
       c.timezone, c.currency, c.contact_email, c.slug,
       CASE WHEN c.archived_at IS NOT NULL THEN 'archived'
            WHEN c.active THEN 'active' ELSE 'inactive' END AS active_status,
       c.created_at, c.updated_at
  FROM public.companies c;
REVOKE ALL ON public.organisations FROM anon;
GRANT SELECT ON public.organisations TO authenticated;

-- ─── 2. Relationships between organisations ─────────────────────────
-- A consultancy SERVES a client; it does not own it. Hierarchy
-- (parent_organisation_id) is legal structure; this is service.

CREATE TABLE IF NOT EXISTS public.organisation_relationships (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_organisation_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  target_organisation_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  relationship_type      text NOT NULL CHECK (relationship_type IN ('consultancy_client','group_parent','subsidiary','service_provider','partner')),
  status                 text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','ended')),
  valid_from             date NOT NULL DEFAULT current_date,
  valid_until            date,
  metadata               jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (source_organisation_id <> target_organisation_id),
  CHECK (valid_until IS NULL OR valid_until >= valid_from)
);
CREATE UNIQUE INDEX IF NOT EXISTS organisation_relationships_one_live
  ON public.organisation_relationships (source_organisation_id, target_organisation_id, relationship_type)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS organisation_relationships_target_idx ON public.organisation_relationships (target_organisation_id);
DROP TRIGGER IF EXISTS organisation_relationships_updated_at ON public.organisation_relationships;
CREATE TRIGGER organisation_relationships_updated_at BEFORE UPDATE ON public.organisation_relationships
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ─── 3. Capability catalogue ─────────────────────────────────────────
-- Roles resolve to capabilities. Mirrored in lib/auth/capabilities.ts
-- (shared pair) and pinned both ways by capabilities.test.ts.

CREATE TABLE IF NOT EXISTS public.access_roles (
  key                   text PRIMARY KEY CHECK (key ~ '^[a-z_]+$'),
  name                  text NOT NULL,
  scope                 text NOT NULL CHECK (scope IN ('platform','organisation')),
  legacy_role           text CHECK (legacy_role IN ('client_admin','client_editor','client_user')),
  read_only             boolean NOT NULL DEFAULT false,
  consultancy_grantable boolean NOT NULL DEFAULT false,
  CHECK ((scope = 'platform') = (legacy_role IS NULL))
);
CREATE TABLE IF NOT EXISTS public.access_capabilities (
  key         text PRIMARY KEY CHECK (key ~ '^[a-z_]+(\.[a-z_]+)+$'),
  description text NOT NULL,
  sensitive   boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS public.access_role_capabilities (
  role_key       text NOT NULL REFERENCES public.access_roles(key) ON DELETE CASCADE,
  capability_key text NOT NULL REFERENCES public.access_capabilities(key) ON DELETE CASCADE,
  PRIMARY KEY (role_key, capability_key)
);
-- The user_role enum a person holds at HOME maps onto a catalogue role.
-- org_kind 'consultancy' rows win for a consultancy's own people: its
-- client_admin is a Consultancy Owner, its client_editor a Consultant.
CREATE TABLE IF NOT EXISTS public.legacy_role_map (
  legacy_role text NOT NULL,
  org_kind    text NOT NULL DEFAULT 'any' CHECK (org_kind IN ('any','consultancy')),
  role_key    text NOT NULL REFERENCES public.access_roles(key),
  PRIMARY KEY (legacy_role, org_kind)
);

INSERT INTO public.access_roles (key, name, scope, legacy_role, read_only, consultancy_grantable) VALUES
  ('platform_super_admin','Platform Super Admin','platform',    NULL,           false, false),
  ('platform_staff',      'Platform Staff',      'platform',    NULL,           false, false),
  ('consultancy_owner',   'Consultancy Owner',   'organisation','client_admin', false, false),
  ('consultant',          'Consultant',          'organisation','client_editor',false, true),
  ('organisation_owner',  'Organisation Owner',  'organisation','client_admin', false, false),
  ('organisation_admin',  'Organisation Admin',  'organisation','client_admin', false, false),
  ('organisation_editor', 'Organisation Editor', 'organisation','client_editor',false, false),
  ('hse_manager',         'HSE Manager',         'organisation','client_editor',false, true),
  ('hse_advisor',         'HSE Advisor',         'organisation','client_editor',false, true),
  ('site_manager',        'Site Manager',        'organisation','client_editor',false, false),
  ('department_manager',  'Department Manager',  'organisation','client_editor',false, false),
  ('hr_manager',          'HR Manager',          'organisation','client_editor',false, false),
  ('recruiter',           'Recruiter',           'organisation','client_editor',false, false),
  ('employee',            'Employee',            'organisation','client_user',  false, false),
  ('read_only',           'Read Only',           'organisation','client_user',  true,  true)
ON CONFLICT (key) DO UPDATE SET name = EXCLUDED.name, scope = EXCLUDED.scope, legacy_role = EXCLUDED.legacy_role,
  read_only = EXCLUDED.read_only, consultancy_grantable = EXCLUDED.consultancy_grantable;

INSERT INTO public.access_capabilities (key, description, sensitive) VALUES
  ('organisation.read',          'See the organisation and its settings', false),
  ('organisation.manage',        'Change organisation settings and users', false),
  ('site.read',                  'See sites, departments and operational areas', false),
  ('site.manage',                'Create and change sites, departments and operational areas', false),
  ('people.read',                'See people records (non-sensitive fields)', false),
  ('people.write',               'Create and change people records', false),
  ('hr.sensitive.read',          'See sensitive HR data (salary, health, diversity, disciplinary)', true),
  ('hr.sensitive.write',         'Change sensitive HR data', true),
  ('risk.read',                  'See risk assessments and controls', false),
  ('risk.create',                'Create risk assessments', false),
  ('risk.approve',               'Approve risk assessments', false),
  ('incident.create',            'Report incidents', false),
  ('incident.investigate',       'Investigate and close incidents', false),
  ('actions.assign',             'Create and assign actions', false),
  ('contractors.manage',         'Manage contractors', false),
  ('documents.manage',           'Upload, version and approve documents', false),
  ('training.manage',            'Manage training and competency', false),
  ('recruitment.manage',         'Manage roles, candidates and offers', false),
  ('billing.read',               'See invoices and billing', false),
  ('billing.manage',             'Change billing, retainers and payment methods', true),
  ('consultancy.client_access',  'Work inside client organisations a consultancy serves', false),
  ('consultancy.manage_access',  'Grant and revoke consultants'' access to served clients', true),
  ('broadcast.send',             'Send broadcasts to organisations', false),
  ('audit.read',                 'Read the audit trail', true)
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description, sensitive = EXCLUDED.sensitive;

DELETE FROM public.access_role_capabilities;
INSERT INTO public.access_role_capabilities (role_key, capability_key)
SELECT r, c FROM (VALUES
  ('platform_super_admin', ARRAY['organisation.read','organisation.manage','site.read','site.manage','people.read','people.write','hr.sensitive.read','hr.sensitive.write','risk.read','risk.create','risk.approve','incident.create','incident.investigate','actions.assign','contractors.manage','documents.manage','training.manage','recruitment.manage','billing.read','billing.manage','consultancy.client_access','consultancy.manage_access','broadcast.send','audit.read']),
  ('platform_staff',       ARRAY['organisation.read','organisation.manage','site.read','site.manage','people.read','people.write','hr.sensitive.read','hr.sensitive.write','risk.read','risk.create','risk.approve','incident.create','incident.investigate','actions.assign','contractors.manage','documents.manage','training.manage','recruitment.manage','billing.read','consultancy.client_access','consultancy.manage_access','broadcast.send','audit.read']),
  ('consultancy_owner',    ARRAY['organisation.read','organisation.manage','site.read','site.manage','people.read','people.write','risk.read','risk.create','risk.approve','incident.create','incident.investigate','actions.assign','contractors.manage','documents.manage','training.manage','billing.read','consultancy.client_access','consultancy.manage_access','broadcast.send','audit.read']),
  ('consultant',           ARRAY['organisation.read','site.read','people.read','risk.read','risk.create','risk.approve','incident.create','incident.investigate','actions.assign','contractors.manage','documents.manage','training.manage','consultancy.client_access']),
  ('organisation_owner',   ARRAY['organisation.read','organisation.manage','site.read','site.manage','people.read','people.write','hr.sensitive.read','hr.sensitive.write','risk.read','risk.create','risk.approve','incident.create','incident.investigate','actions.assign','contractors.manage','documents.manage','training.manage','recruitment.manage','billing.read','billing.manage','audit.read']),
  ('organisation_admin',   ARRAY['organisation.read','organisation.manage','site.read','site.manage','people.read','people.write','hr.sensitive.read','hr.sensitive.write','risk.read','risk.create','risk.approve','incident.create','incident.investigate','actions.assign','contractors.manage','documents.manage','training.manage','recruitment.manage','billing.read','audit.read']),
  ('organisation_editor',  ARRAY['organisation.read','site.read','people.read','people.write','risk.read','risk.create','incident.create','actions.assign','documents.manage','training.manage','recruitment.manage']),
  ('hse_manager',          ARRAY['organisation.read','site.read','site.manage','people.read','risk.read','risk.create','risk.approve','incident.create','incident.investigate','actions.assign','contractors.manage','documents.manage','training.manage']),
  ('hse_advisor',          ARRAY['organisation.read','site.read','people.read','risk.read','risk.create','incident.create','incident.investigate','actions.assign','documents.manage']),
  ('site_manager',         ARRAY['organisation.read','site.read','site.manage','people.read','risk.read','risk.create','incident.create','incident.investigate','actions.assign','contractors.manage']),
  ('department_manager',   ARRAY['organisation.read','site.read','people.read','risk.read','incident.create','actions.assign']),
  ('hr_manager',           ARRAY['organisation.read','site.read','people.read','people.write','hr.sensitive.read','hr.sensitive.write','documents.manage','training.manage','actions.assign','audit.read']),
  ('recruiter',            ARRAY['organisation.read','people.read','recruitment.manage']),
  ('employee',             ARRAY['organisation.read','site.read','incident.create']),
  ('read_only',            ARRAY['organisation.read','site.read','people.read','risk.read'])
) AS m(r, caps), unnest(m.caps) AS c;

INSERT INTO public.legacy_role_map (legacy_role, org_kind, role_key) VALUES
  ('tps_admin','any','platform_super_admin'), ('tps_client','any','read_only'), ('client_admin','any','organisation_admin'),
  ('client_editor','any','organisation_editor'), ('client_user','any','employee'), ('hs_provider','any','read_only'),
  ('client_admin','consultancy','consultancy_owner'), ('client_editor','consultancy','consultant')
ON CONFLICT (legacy_role, org_kind) DO UPDATE SET role_key = EXCLUDED.role_key;

-- ─── 4. Grants and the active organisation ──────────────────────────

CREATE TABLE IF NOT EXISTS public.user_organisation_access (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organisation_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  role_key            text NOT NULL REFERENCES public.access_roles(key),
  access_scope        text NOT NULL DEFAULT 'full' CHECK (access_scope IN ('full','health_safety','hr','recruitment')),
  valid_from          timestamptz NOT NULL DEFAULT now(),
  valid_until         timestamptz,
  active_status       text NOT NULL DEFAULT 'active' CHECK (active_status IN ('active','suspended','revoked')),
  via_relationship_id uuid REFERENCES public.organisation_relationships(id) ON DELETE SET NULL,
  granted_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  revoked_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, organisation_id),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);
CREATE INDEX IF NOT EXISTS user_organisation_access_org_idx ON public.user_organisation_access (organisation_id);
DROP TRIGGER IF EXISTS user_organisation_access_updated_at ON public.user_organisation_access;
CREATE TRIGGER user_organisation_access_updated_at BEFORE UPDATE ON public.user_organisation_access
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Only organisation-scoped roles are grantable; nobody is granted their
-- own home company (home access comes from profiles, not a grant).
CREATE OR REPLACE FUNCTION public.user_organisation_access_validate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  -- Revoking or suspending is always allowed; only a LIVE grant is checked.
  IF NEW.active_status <> 'active' THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM access_roles WHERE key = NEW.role_key AND scope = 'organisation') THEN
    RAISE EXCEPTION 'Role % cannot be granted on an organisation', NEW.role_key USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id = NEW.user_id AND company_id = NEW.organisation_id) THEN
    RAISE EXCEPTION 'A user already belongs to their home organisation' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM profiles WHERE id = NEW.user_id AND role::text IN ('tps_admin','tps_client','hs_provider')) THEN
    RAISE EXCEPTION 'Platform accounts are not granted organisation access' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.user_organisation_access_validate() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS user_organisation_access_validate ON public.user_organisation_access;
CREATE TRIGGER user_organisation_access_validate BEFORE INSERT OR UPDATE ON public.user_organisation_access
  FOR EACH ROW EXECUTE FUNCTION public.user_organisation_access_validate();

CREATE TABLE IF NOT EXISTS public.user_active_organisation (
  user_id         uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organisation_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  switched_at     timestamptz NOT NULL DEFAULT now()
);

-- ─── 5. The helpers every policy runs through ───────────────────────

-- The caller's live grant for their CURRENT active organisation, if any.
CREATE OR REPLACE FUNCTION public.my_active_grant()
RETURNS TABLE (organisation_id uuid, role_key text, legacy_role text, read_only boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT g.organisation_id, g.role_key, r.legacy_role, r.read_only
    FROM user_active_organisation a
    JOIN user_organisation_access g ON g.user_id = a.user_id AND g.organisation_id = a.organisation_id
    JOIN access_roles r ON r.key = g.role_key
   WHERE a.user_id = auth.uid()
     AND g.active_status = 'active'
     AND g.valid_from <= now()
     AND (g.valid_until IS NULL OR g.valid_until > now())
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.my_home_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid()
$$;

-- EFFECTIVE company: the active organisation while its grant is live,
-- else home. Signature unchanged — 140+ policies call it.
CREATE OR REPLACE FUNCTION public.my_company_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(
    (SELECT organisation_id FROM public.my_active_grant()),
    (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
$$;

-- EFFECTIVE legacy role. Platform roles are never overridden by a grant.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p.role::text IN ('tps_admin','tps_client','hs_provider') THEN p.role::text
    ELSE COALESCE((SELECT legacy_role FROM public.my_active_grant()), p.role::text)
  END
  FROM profiles p WHERE p.id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_company_super_user()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT public.get_my_role()) = 'client_admin', false)
$$;

-- HOME admin, whatever organisation the caller is acting in.
CREATE OR REPLACE FUNCTION public.is_home_company_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'client_admin')
$$;

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (company_id uuid, ui_preferences jsonb, onboarding_completed boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT public.my_company_id(), p.ui_preferences, p.onboarding_completed
    FROM profiles p WHERE p.id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.session_can_write()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT NOT COALESCE((SELECT read_only FROM public.my_active_grant()), false)
$$;

-- The catalogue role the caller holds in their HOME organisation.
CREATE OR REPLACE FUNCTION public.my_home_role_key()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT m.role_key
    FROM profiles p
    LEFT JOIN companies c ON c.id = p.company_id
    JOIN legacy_role_map m ON m.legacy_role = p.role::text
     AND m.org_kind IN ('any', CASE WHEN c.organisation_type = 'consultancy' THEN 'consultancy' ELSE 'any' END)
   WHERE p.id = auth.uid()
   ORDER BY (m.org_kind = 'consultancy') DESC
   LIMIT 1
$$;

-- Does the caller hold `p_cap` in `p_org`? Staff: always. Otherwise the
-- union of the home role (when p_org is home) and a live grant on p_org.
CREATE OR REPLACE FUNCTION public.has_capability(p_org uuid, p_cap text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL OR p_org IS NULL THEN false
    WHEN public.is_tps_staff() THEN true
    ELSE EXISTS (
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
  END
$$;

-- True when `p_user` belongs to the caller's HOME company. Needed because
-- a subquery on profiles inside a policy runs under the caller's RLS,
-- which (while acting in a client) shows that client's people, not home.
CREATE OR REPLACE FUNCTION public.is_home_colleague(p_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM profiles a JOIN profiles b ON b.company_id = a.company_id
                  WHERE a.id = auth.uid() AND b.id = p_user AND a.company_id IS NOT NULL)
$$;

-- my_company_id / get_my_role / is_company_super_user / get_my_profile
-- keep their existing grants (anon included): older policies are TO
-- public, and an anon caller must keep getting "no rows", not a 42501.
-- The new helpers are signed-in only.
REVOKE ALL ON FUNCTION public.my_active_grant(), public.my_home_company_id(), public.is_home_company_admin(),
  public.session_can_write(), public.has_capability(uuid, text), public.is_home_colleague(uuid),
  public.my_home_role_key() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_active_grant(), public.my_home_company_id(), public.is_home_company_admin(),
  public.session_can_write(), public.has_capability(uuid, text), public.is_home_colleague(uuid),
  public.my_home_role_key() TO authenticated, service_role;

-- ─── 6. Immutable audit trail ────────────────────────────────────────
-- platform_events is the PROCESSING outbox (leased, retried, marked
-- processed). audit_events is the RECORD: written only by DEFINER code,
-- never updated, never deleted — not even by the service role.

CREATE TABLE IF NOT EXISTS public.audit_events (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at     timestamptz NOT NULL DEFAULT now(),
  organisation_id uuid,
  site_id         uuid,
  user_id         uuid,
  actor_kind      text NOT NULL CHECK (actor_kind IN ('staff','client','consultant','system')),
  action          text NOT NULL CHECK (action ~ '^[a-z_]+\.[a-z_]+$'),
  entity_type     text NOT NULL,
  entity_id       text,
  previous_value  jsonb,
  new_value       jsonb,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb,
  context         jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS audit_events_org_time_idx ON public.audit_events (organisation_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS audit_events_entity_idx ON public.audit_events (entity_type, entity_id);

CREATE OR REPLACE FUNCTION public.audit_actor_kind()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN auth.uid() IS NULL THEN 'system'
    WHEN public.is_tps_staff() THEN 'staff'
    WHEN EXISTS (SELECT 1 FROM public.my_active_grant()) THEN 'consultant'
    ELSE 'client' END
$$;
REVOKE ALL ON FUNCTION public.audit_actor_kind() FROM PUBLIC, anon, authenticated;

-- Request context from PostgREST, never trusted for authorisation.
CREATE OR REPLACE FUNCTION public.audit_context()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'db_role',    current_user,
    'session_id', NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'session_id',
    'ip',         split_part(NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'x-forwarded-for', ',', 1),
    'user_agent', left(NULLIF(current_setting('request.headers', true), '')::jsonb ->> 'user-agent', 300)))
$$;
REVOKE ALL ON FUNCTION public.audit_context() FROM PUBLIC, anon, authenticated;

-- For events that are not a row change (broadcast.sent,
-- document.downloaded…). Service role only.
CREATE OR REPLACE FUNCTION public.audit_log(
  p_action text, p_entity_type text, p_entity_id text, p_organisation_id uuid,
  p_previous jsonb DEFAULT NULL, p_new jsonb DEFAULT NULL, p_metadata jsonb DEFAULT '{}'::jsonb,
  p_user_id uuid DEFAULT NULL, p_site_id uuid DEFAULT NULL)
RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO audit_events (organisation_id, site_id, user_id, actor_kind, action, entity_type, entity_id,
                            previous_value, new_value, metadata, context)
  VALUES (p_organisation_id, p_site_id, COALESCE(p_user_id, auth.uid()),
          CASE WHEN p_user_id IS NULL THEN public.audit_actor_kind()
               WHEN EXISTS (SELECT 1 FROM profiles WHERE id = p_user_id AND role = 'tps_admin') THEN 'staff'
               ELSE 'client' END,
          p_action, p_entity_type, p_entity_id, p_previous, p_new, COALESCE(p_metadata, '{}'::jsonb), public.audit_context())
  RETURNING id
$$;
REVOKE ALL ON FUNCTION public.audit_log(text, text, text, uuid, jsonb, jsonb, jsonb, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.audit_log(text, text, text, uuid, jsonb, jsonb, jsonb, uuid, uuid) TO service_role;

-- Row trigger. TG_ARGV[0] = entity name (action prefix), [1] = column
-- holding the organisation id, [2..] = whitelisted columns. Only
-- whitelisted columns are recorded, so no salary, NI number or free text
-- lands in the trail; an UPDATE that changes none of them is not logged.
CREATE OR REPLACE FUNCTION public.audit_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  entity  text := TG_ARGV[0];
  org_col text := TG_ARGV[1];
  cols    text[] := TG_ARGV[2:TG_NARGS - 1];
  o jsonb := CASE WHEN TG_OP <> 'INSERT' THEN to_jsonb(OLD) END;
  n jsonb := CASE WHEN TG_OP <> 'DELETE' THEN to_jsonb(NEW) END;
  po jsonb := '{}'::jsonb; pn jsonb := '{}'::jsonb;
  c text; verb text; src jsonb;
BEGIN
  FOREACH c IN ARRAY cols LOOP
    IF o IS NOT NULL THEN po := po || jsonb_build_object(c, o -> c); END IF;
    IF n IS NOT NULL THEN pn := pn || jsonb_build_object(c, n -> c); END IF;
  END LOOP;
  IF TG_OP = 'UPDATE' AND po = pn THEN RETURN NULL; END IF;
  verb := CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'DELETE' THEN 'deleted' ELSE 'updated' END;
  src := COALESCE(n, o);
  INSERT INTO audit_events (organisation_id, site_id, user_id, actor_kind, action, entity_type, entity_id,
                            previous_value, new_value, context)
  VALUES (CASE WHEN org_col = '-' THEN NULL ELSE NULLIF(src ->> org_col, '')::uuid END,
          NULLIF(src ->> 'site_id', '')::uuid,
          auth.uid(), public.audit_actor_kind(), entity || '.' || verb, TG_TABLE_NAME, src ->> 'id',
          CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE po END,
          CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE pn END,
          public.audit_context());
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.audit_row() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_events_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only' USING ERRCODE = '42501';
END $$;
DROP TRIGGER IF EXISTS audit_events_immutable ON public.audit_events;
CREATE TRIGGER audit_events_immutable BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.audit_events_immutable();
DROP TRIGGER IF EXISTS audit_events_no_truncate ON public.audit_events;
CREATE TRIGGER audit_events_no_truncate BEFORE TRUNCATE ON public.audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION public.audit_events_immutable();

ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_events FROM PUBLIC, anon, authenticated, service_role;
DROP POLICY IF EXISTS audit_events_staff_read ON public.audit_events;
CREATE POLICY audit_events_staff_read ON public.audit_events
  FOR SELECT TO authenticated USING ((SELECT public.is_tps_staff()));
DROP POLICY IF EXISTS audit_events_org_read ON public.audit_events;
CREATE POLICY audit_events_org_read ON public.audit_events
  FOR SELECT TO authenticated
  USING (organisation_id = (SELECT public.my_company_id())
         AND public.has_capability(organisation_id, 'audit.read'));

-- ─── 7. RPCs: switching, listing, granting, revoking ─────────────────

CREATE OR REPLACE FUNCTION public.set_active_organisation(p_org uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE home uuid; prev uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT company_id INTO home FROM profiles WHERE id = auth.uid();
  prev := public.my_company_id();
  IF p_org IS NULL OR p_org IS NOT DISTINCT FROM home THEN
    DELETE FROM user_active_organisation WHERE user_id = auth.uid();
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM user_organisation_access g
       WHERE g.user_id = auth.uid() AND g.organisation_id = p_org AND g.active_status = 'active'
         AND g.valid_from <= now() AND (g.valid_until IS NULL OR g.valid_until > now())) THEN
      RAISE EXCEPTION 'No access to that organisation' USING ERRCODE = '42501';
    END IF;
    INSERT INTO user_active_organisation (user_id, organisation_id, switched_at)
    VALUES (auth.uid(), p_org, now())
    ON CONFLICT (user_id) DO UPDATE SET organisation_id = EXCLUDED.organisation_id, switched_at = now();
  END IF;
  IF public.my_company_id() IS DISTINCT FROM prev THEN
    INSERT INTO audit_events (organisation_id, user_id, actor_kind, action, entity_type, entity_id, previous_value, new_value, context)
    VALUES (public.my_company_id(), auth.uid(), public.audit_actor_kind(), 'organisation.switched', 'user_active_organisation',
            auth.uid()::text, jsonb_build_object('organisation_id', prev), jsonb_build_object('organisation_id', public.my_company_id()),
            public.audit_context());
  END IF;
  RETURN public.my_company_id();
END $$;

-- Everything the switcher may offer: home plus every LIVE grant.
CREATE OR REPLACE FUNCTION public.my_organisations()
RETURNS TABLE (organisation_id uuid, name text, organisation_type text, role_key text, is_home boolean, is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT c.id, c.name, c.organisation_type, public.my_home_role_key(), true, c.id = public.my_company_id()
    FROM profiles p JOIN companies c ON c.id = p.company_id
   WHERE p.id = auth.uid()
  UNION ALL
  SELECT c.id, c.name, c.organisation_type, g.role_key, false, c.id = public.my_company_id()
    FROM user_organisation_access g JOIN companies c ON c.id = g.organisation_id
   WHERE g.user_id = auth.uid() AND g.active_status = 'active'
     AND g.valid_from <= now() AND (g.valid_until IS NULL OR g.valid_until > now())
     AND c.archived_at IS NULL
  ORDER BY 5 DESC, 2
$$;

-- Staff grant anything; a consultancy owner may grant its OWN people a
-- consultancy-grantable role on a client it has a live consultancy_client
-- relationship with — and nothing else.
CREATE OR REPLACE FUNCTION public.grant_organisation_access(
  p_user uuid, p_org uuid, p_role text, p_valid_until timestamptz DEFAULT NULL, p_scope text DEFAULT 'full')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE caller_home uuid; rel uuid; gid uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  IF p_user = auth.uid() AND NOT public.is_tps_staff() THEN
    RAISE EXCEPTION 'You cannot grant yourself access' USING ERRCODE = '42501';
  END IF;
  IF NOT public.is_tps_staff() THEN
    caller_home := public.my_home_company_id();
    IF caller_home IS NULL OR NOT public.has_capability(caller_home, 'consultancy.manage_access')
       OR NOT EXISTS (SELECT 1 FROM companies WHERE id = caller_home AND organisation_type = 'consultancy') THEN
      RAISE EXCEPTION 'Not permitted to grant access' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = p_user AND company_id = caller_home) THEN
      RAISE EXCEPTION 'You can only grant access to people in your own organisation' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM access_roles WHERE key = p_role AND consultancy_grantable) THEN
      RAISE EXCEPTION 'That role cannot be granted by a consultancy' USING ERRCODE = '42501';
    END IF;
    SELECT id INTO rel FROM organisation_relationships
     WHERE source_organisation_id = caller_home AND target_organisation_id = p_org
       AND relationship_type = 'consultancy_client' AND status = 'active'
       AND valid_from <= current_date AND (valid_until IS NULL OR valid_until >= current_date);
    IF rel IS NULL THEN
      RAISE EXCEPTION 'Your organisation does not serve that client' USING ERRCODE = '42501';
    END IF;
  END IF;
  INSERT INTO user_organisation_access (user_id, organisation_id, role_key, access_scope, valid_until,
                                        active_status, via_relationship_id, granted_by, revoked_by, revoked_at)
  VALUES (p_user, p_org, p_role, COALESCE(p_scope, 'full'), p_valid_until, 'active', rel, auth.uid(), NULL, NULL)
  ON CONFLICT (user_id, organisation_id) DO UPDATE
    SET role_key = EXCLUDED.role_key, access_scope = EXCLUDED.access_scope, valid_until = EXCLUDED.valid_until,
        valid_from = now(), active_status = 'active', via_relationship_id = EXCLUDED.via_relationship_id,
        granted_by = EXCLUDED.granted_by, revoked_by = NULL, revoked_at = NULL
  RETURNING id INTO gid;
  RETURN gid;
END $$;

CREATE OR REPLACE FUNCTION public.revoke_organisation_access(p_grant uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE g user_organisation_access; caller_home uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT * INTO g FROM user_organisation_access WHERE id = p_grant;
  IF g.id IS NULL THEN RAISE EXCEPTION 'No such grant' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.is_tps_staff() THEN
    caller_home := public.my_home_company_id();
    -- The consultancy that granted it, or the client whose data it opens.
    IF NOT (
      (public.has_capability(caller_home, 'consultancy.manage_access')
        AND EXISTS (SELECT 1 FROM profiles WHERE id = g.user_id AND company_id = caller_home))
      OR (g.organisation_id = caller_home AND public.is_home_company_admin())
    ) THEN
      RAISE EXCEPTION 'Not permitted to revoke this access' USING ERRCODE = '42501';
    END IF;
  END IF;
  UPDATE user_organisation_access SET active_status = 'revoked', revoked_by = auth.uid(), revoked_at = now()
   WHERE id = p_grant;
  DELETE FROM user_active_organisation WHERE user_id = g.user_id AND organisation_id = g.organisation_id;
END $$;

REVOKE ALL ON FUNCTION public.set_active_organisation(uuid), public.my_organisations(),
  public.grant_organisation_access(uuid, uuid, text, timestamptz, text), public.revoke_organisation_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_active_organisation(uuid), public.my_organisations(),
  public.grant_organisation_access(uuid, uuid, text, timestamptz, text), public.revoke_organisation_access(uuid) TO authenticated;

-- ─── 8. RLS for the new tables ───────────────────────────────────────

ALTER TABLE public.organisation_relationships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS organisation_relationships_staff_all ON public.organisation_relationships;
CREATE POLICY organisation_relationships_staff_all ON public.organisation_relationships
  FOR ALL TO authenticated USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
-- Each side sees its own rows: a client sees who serves IT, never the
-- consultancy's other clients.
DROP POLICY IF EXISTS organisation_relationships_party_read ON public.organisation_relationships;
CREATE POLICY organisation_relationships_party_read ON public.organisation_relationships
  FOR SELECT TO authenticated
  USING (source_organisation_id = (SELECT public.my_home_company_id())
      OR target_organisation_id = (SELECT public.my_home_company_id()));

ALTER TABLE public.access_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_role_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legacy_role_map ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['access_roles','access_capabilities','access_role_capabilities','legacy_role_map'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_read ON public.%1$s', t);
    EXECUTE format('CREATE POLICY %1$s_read ON public.%1$s FOR SELECT TO authenticated USING (true)', t);
    EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.%1$s FROM PUBLIC, anon, authenticated', t);
  END LOOP;
END $$;

ALTER TABLE public.user_organisation_access ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_organisation_access FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS user_organisation_access_read ON public.user_organisation_access;
CREATE POLICY user_organisation_access_read ON public.user_organisation_access
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid())
      OR (SELECT public.is_tps_staff())
      -- a client's own admins see who can reach their data
      OR (organisation_id = (SELECT public.my_home_company_id()) AND (SELECT public.is_home_company_admin()))
      -- a consultancy's managers see the grants of their own people
      OR (public.has_capability((SELECT public.my_home_company_id()), 'consultancy.manage_access')
          AND public.is_home_colleague(user_id)));

ALTER TABLE public.user_active_organisation ENABLE ROW LEVEL SECURITY;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_active_organisation FROM PUBLIC, anon, authenticated;
DROP POLICY IF EXISTS user_active_organisation_own ON public.user_active_organisation;
CREATE POLICY user_active_organisation_own ON public.user_active_organisation
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()) OR (SELECT public.is_tps_staff()));

-- ─── 9. The read-only write guard ────────────────────────────────────
-- Three RESTRICTIVE policies per table. Tables created by later
-- migrations call apply_write_guard() themselves.

CREATE OR REPLACE FUNCTION public.apply_write_guard(p_table regclass)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE t text := (SELECT relname FROM pg_class WHERE oid = p_table);
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS write_guard_ins ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS write_guard_upd ON %s', p_table);
  EXECUTE format('DROP POLICY IF EXISTS write_guard_del ON %s', p_table);
  EXECUTE format('CREATE POLICY write_guard_ins ON %s AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((SELECT public.session_can_write()))', p_table);
  EXECUTE format('CREATE POLICY write_guard_upd ON %s AS RESTRICTIVE FOR UPDATE TO authenticated USING ((SELECT public.session_can_write()))', p_table);
  EXECUTE format('CREATE POLICY write_guard_del ON %s AS RESTRICTIVE FOR DELETE TO authenticated USING ((SELECT public.session_can_write()))', p_table);
END $$;
REVOKE ALL ON FUNCTION public.apply_write_guard(regclass) FROM PUBLIC, anon, authenticated;

-- Excluded: a read-only user still manages their OWN notifications,
-- preferences, profile, Jev feedback and GDPR requests; and the tables
-- no session can write at all.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT c.oid::regclass AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
              AND c.relname NOT IN ('profiles','notifications','notification_preferences','jev_decisions',
                                    'data_access_requests','audit_events','user_active_organisation',
                                    'user_organisation_access','access_roles','access_capabilities',
                                    'access_role_capabilities','legacy_role_map')
  LOOP PERFORM public.apply_write_guard(r.t); END LOOP;
END $$;
-- Files too: a read-only grant must not upload into the client's folder.
SELECT public.apply_write_guard('storage.objects');

-- ─── 10. Audit triggers on existing tables ──────────────────────────

DROP TRIGGER IF EXISTS profiles_audit ON public.profiles;
CREATE TRIGGER profiles_audit AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('user', 'company_id', 'role', 'company_id', 'email', 'full_name');
DROP TRIGGER IF EXISTS companies_audit ON public.companies;
CREATE TRIGGER companies_audit AFTER INSERT OR UPDATE OR DELETE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('organisation', 'id', 'name', 'active', 'archived_at', 'feature_flags',
    'organisation_type', 'parent_organisation_id', 'monthly_retainer_pence', 'subscription_status', 'account_owner_id');
DROP TRIGGER IF EXISTS organisation_relationships_audit ON public.organisation_relationships;
CREATE TRIGGER organisation_relationships_audit AFTER INSERT OR UPDATE OR DELETE ON public.organisation_relationships
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('relationship', 'target_organisation_id', 'source_organisation_id',
    'target_organisation_id', 'relationship_type', 'status', 'valid_from', 'valid_until');
DROP TRIGGER IF EXISTS user_organisation_access_audit ON public.user_organisation_access;
CREATE TRIGGER user_organisation_access_audit AFTER INSERT OR UPDATE OR DELETE ON public.user_organisation_access
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('access', 'organisation_id', 'user_id', 'organisation_id', 'role_key',
    'access_scope', 'valid_from', 'valid_until', 'active_status');
DROP TRIGGER IF EXISTS employee_records_audit ON public.employee_records;
CREATE TRIGGER employee_records_audit AFTER INSERT OR UPDATE OR DELETE ON public.employee_records
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('employee', 'company_id', 'full_name', 'job_title', 'department',
    'status', 'start_date', 'end_date', 'employee_number', 'line_manager');
DROP TRIGGER IF EXISTS referral_applications_audit ON public.referral_applications;
CREATE TRIGGER referral_applications_audit AFTER INSERT OR UPDATE OR DELETE ON public.referral_applications
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('referral', '-', 'status', 'requisition_id', 'candidate_id');
DROP TRIGGER IF EXISTS one_off_invoices_audit ON public.one_off_invoices;
CREATE TRIGGER one_off_invoices_audit AFTER INSERT OR UPDATE OR DELETE ON public.one_off_invoices
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('invoice', 'company_id', 'status', 'total_pence', 'currency',
    'due_date', 'sent_at', 'paid_at', 'stripe_invoice_id');
DROP TRIGGER IF EXISTS hs_incidents_audit ON public.hs_incidents;
CREATE TRIGGER hs_incidents_audit AFTER INSERT OR UPDATE OR DELETE ON public.hs_incidents
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('incident', 'company_id', 'incident_type', 'severity', 'status',
    'riddor_reportable', 'riddor_reported_on', 'site_id');
DROP TRIGGER IF EXISTS documents_audit ON public.documents;
CREATE TRIGGER documents_audit AFTER INSERT OR UPDATE OR DELETE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('document', 'company_id', 'name', 'category', 'version', 'status',
    'file_path', 'file_url', 'approved_by', 'approved_at');
DROP TRIGGER IF EXISTS athletes_audit ON public.athletes;
CREATE TRIGGER athletes_audit AFTER INSERT OR UPDATE OR DELETE ON public.athletes
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('athlete', 'company_id', 'full_name', 'email', 'cv_storage_path',
    'welcome_email_sent_at', 'source');

-- ─── 11. The 43 policies that bypassed the helpers ──────────────────
-- Generated from live pg_policies (2026-09-26): each keeps its command,
-- roles and permissiveness; `profiles.company_id` subqueries become
-- my_company_id(), `role = 'client_admin'` becomes is_company_super_user(),
-- and the tps_admin/tps_client check becomes is_tps_staff().

DROP POLICY IF EXISTS training_interests_client_rw ON public.athlete_training_interests;
CREATE POLICY training_interests_client_rw ON public.athlete_training_interests
  AS PERMISSIVE FOR ALL TO public
  USING ((athlete_id IN ( SELECT a.id FROM athletes a WHERE (a.company_id = (SELECT public.my_company_id())))))
  WITH CHECK ((athlete_id IN ( SELECT a.id FROM athletes a WHERE (a.company_id = (SELECT public.my_company_id())))));

DROP POLICY IF EXISTS brand_profiles_client_select ON public.brand_profiles;
CREATE POLICY brand_profiles_client_select ON public.brand_profiles
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((company_id IS NULL) OR (company_id = (SELECT public.my_company_id()))));

DROP POLICY IF EXISTS ca_s_ins ON public.company_assessments;
CREATE POLICY ca_s_ins ON public.company_assessments
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((company_id = (SELECT public.my_company_id())));

DROP POLICY IF EXISTS ca_s_sel ON public.company_assessments;
CREATE POLICY ca_s_sel ON public.company_assessments
  AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = (SELECT public.my_company_id())));

DROP POLICY IF EXISTS calendar_events_delete ON public.company_calendar_events;
CREATE POLICY calendar_events_delete ON public.company_calendar_events
  AS PERMISSIVE FOR DELETE TO public
  USING ((((company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()))) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS calendar_events_insert ON public.company_calendar_events;
CREATE POLICY calendar_events_insert ON public.company_calendar_events
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((((company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()))) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS calendar_events_select ON public.company_calendar_events;
CREATE POLICY calendar_events_select ON public.company_calendar_events
  AS PERMISSIVE FOR SELECT TO public
  USING (((company_id = (SELECT public.my_company_id())) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS calendar_events_update ON public.company_calendar_events;
CREATE POLICY calendar_events_update ON public.company_calendar_events
  AS PERMISSIVE FOR UPDATE TO public
  USING ((((company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()))) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS fi_sel ON public.company_friction_items;
CREATE POLICY fi_sel ON public.company_friction_items
  AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = (SELECT public.my_company_id())));

DROP POLICY IF EXISTS data_access_req_sel ON public.data_access_requests;
CREATE POLICY data_access_req_sel ON public.data_access_requests
  AS PERMISSIVE FOR SELECT TO public
  USING (((requested_by = auth.uid()) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS data_access_req_upd ON public.data_access_requests;
CREATE POLICY data_access_req_upd ON public.data_access_requests
  AS PERMISSIVE FOR UPDATE TO public
  USING (((SELECT public.is_tps_staff())));

DROP POLICY IF EXISTS dev_plan_milestones_client_select ON public.dev_plan_milestones;
CREATE POLICY dev_plan_milestones_client_select ON public.dev_plan_milestones
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((plan_id IN ( SELECT dev_plans.id FROM dev_plans WHERE ((dev_plans.company_id = (SELECT public.my_company_id())) AND (dev_plans.status = ANY (ARRAY['active'::dev_plan_status, 'completed'::dev_plan_status]))))));

DROP POLICY IF EXISTS dev_plans_client_select ON public.dev_plans;
CREATE POLICY dev_plans_client_select ON public.dev_plans
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((company_id = (SELECT public.my_company_id())) AND (status = ANY (ARRAY['active'::dev_plan_status, 'completed'::dev_plan_status]))));

DROP POLICY IF EXISTS employee_records_insert ON public.employee_records;
CREATE POLICY employee_records_insert ON public.employee_records
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((((company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()))) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS employee_records_select ON public.employee_records;
CREATE POLICY employee_records_select ON public.employee_records
  AS PERMISSIVE FOR SELECT TO public
  USING (((company_id = (SELECT public.my_company_id())) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS employee_records_update ON public.employee_records;
CREATE POLICY employee_records_update ON public.employee_records
  AS PERMISSIVE FOR UPDATE TO public
  USING ((((company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()))) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS leave_records_insert ON public.leave_records;
CREATE POLICY leave_records_insert ON public.leave_records
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((((company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()))) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS leave_records_select ON public.leave_records;
CREATE POLICY leave_records_select ON public.leave_records
  AS PERMISSIVE FOR SELECT TO public
  USING (((company_id = (SELECT public.my_company_id())) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS leave_records_update ON public.leave_records;
CREATE POLICY leave_records_update ON public.leave_records
  AS PERMISSIVE FOR UPDATE TO public
  USING ((((company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()))) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS offboard_inst_mod ON public.offboarding_instances;
CREATE POLICY offboard_inst_mod ON public.offboarding_instances
  AS PERMISSIVE FOR ALL TO public
  USING ((((company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()))) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS offboard_inst_sel ON public.offboarding_instances;
CREATE POLICY offboard_inst_sel ON public.offboarding_instances
  AS PERMISSIVE FOR SELECT TO public
  USING (((company_id = (SELECT public.my_company_id())) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS offboard_prog_mod ON public.offboarding_task_progress;
CREATE POLICY offboard_prog_mod ON public.offboarding_task_progress
  AS PERMISSIVE FOR ALL TO public
  USING (((instance_id IN ( SELECT offboarding_instances.id FROM offboarding_instances WHERE ((offboarding_instances.company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()))))) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS offboard_prog_sel ON public.offboarding_task_progress;
CREATE POLICY offboard_prog_sel ON public.offboarding_task_progress
  AS PERMISSIVE FOR SELECT TO public
  USING (((instance_id IN ( SELECT offboarding_instances.id FROM offboarding_instances WHERE (offboarding_instances.company_id = (SELECT public.my_company_id())))) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS offboard_tmpl_tasks_mod ON public.offboarding_template_tasks;
CREATE POLICY offboard_tmpl_tasks_mod ON public.offboarding_template_tasks
  AS PERMISSIVE FOR ALL TO public
  USING (((template_id IN ( SELECT offboarding_templates.id FROM offboarding_templates WHERE ((offboarding_templates.company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()))))) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS offboard_tmpl_tasks_sel ON public.offboarding_template_tasks;
CREATE POLICY offboard_tmpl_tasks_sel ON public.offboarding_template_tasks
  AS PERMISSIVE FOR SELECT TO public
  USING (((template_id IN ( SELECT offboarding_templates.id FROM offboarding_templates WHERE (offboarding_templates.company_id = (SELECT public.my_company_id())))) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS offboard_tmpl_mod ON public.offboarding_templates;
CREATE POLICY offboard_tmpl_mod ON public.offboarding_templates
  AS PERMISSIVE FOR ALL TO public
  USING ((((company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()))) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS offboard_tmpl_sel ON public.offboarding_templates;
CREATE POLICY offboard_tmpl_sel ON public.offboarding_templates
  AS PERMISSIVE FOR SELECT TO public
  USING (((company_id = (SELECT public.my_company_id())) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS onboard_inst_mod ON public.onboarding_instances;
CREATE POLICY onboard_inst_mod ON public.onboarding_instances
  AS PERMISSIVE FOR ALL TO public
  USING ((((company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()))) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS onboard_inst_sel ON public.onboarding_instances;
CREATE POLICY onboard_inst_sel ON public.onboarding_instances
  AS PERMISSIVE FOR SELECT TO public
  USING (((company_id = (SELECT public.my_company_id())) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS onboard_prog_mod ON public.onboarding_task_progress;
CREATE POLICY onboard_prog_mod ON public.onboarding_task_progress
  AS PERMISSIVE FOR ALL TO public
  USING (((instance_id IN ( SELECT onboarding_instances.id FROM onboarding_instances WHERE ((onboarding_instances.company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()))))) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS onboard_prog_sel ON public.onboarding_task_progress;
CREATE POLICY onboard_prog_sel ON public.onboarding_task_progress
  AS PERMISSIVE FOR SELECT TO public
  USING (((instance_id IN ( SELECT onboarding_instances.id FROM onboarding_instances WHERE (onboarding_instances.company_id = (SELECT public.my_company_id())))) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS onboard_tmpl_tasks_mod ON public.onboarding_template_tasks;
CREATE POLICY onboard_tmpl_tasks_mod ON public.onboarding_template_tasks
  AS PERMISSIVE FOR ALL TO public
  USING (((template_id IN ( SELECT onboarding_templates.id FROM onboarding_templates WHERE ((onboarding_templates.company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()))))) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS onboard_tmpl_tasks_sel ON public.onboarding_template_tasks;
CREATE POLICY onboard_tmpl_tasks_sel ON public.onboarding_template_tasks
  AS PERMISSIVE FOR SELECT TO public
  USING (((template_id IN ( SELECT onboarding_templates.id FROM onboarding_templates WHERE (onboarding_templates.company_id = (SELECT public.my_company_id())))) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS onboard_tmpl_mod ON public.onboarding_templates;
CREATE POLICY onboard_tmpl_mod ON public.onboarding_templates
  AS PERMISSIVE FOR ALL TO public
  USING ((((company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()))) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS onboard_tmpl_sel ON public.onboarding_templates;
CREATE POLICY onboard_tmpl_sel ON public.onboarding_templates
  AS PERMISSIVE FOR SELECT TO public
  USING (((company_id = (SELECT public.my_company_id())) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS one_off_invoices_client_read ON public.one_off_invoices;
CREATE POLICY one_off_invoices_client_read ON public.one_off_invoices
  AS PERMISSIVE FOR SELECT TO public
  USING ((company_id = (SELECT public.my_company_id())));

DROP POLICY IF EXISTS one_off_invoices_staff_all ON public.one_off_invoices;
CREATE POLICY one_off_invoices_staff_all ON public.one_off_invoices
  AS PERMISSIVE FOR ALL TO public
  USING (((SELECT public.is_tps_staff())))
  WITH CHECK (((SELECT public.is_tps_staff())));

DROP POLICY IF EXISTS policy_ack_mod ON public.policy_acknowledgements;
CREATE POLICY policy_ack_mod ON public.policy_acknowledgements
  AS PERMISSIVE FOR ALL TO public
  USING ((((company_id = (SELECT public.my_company_id()) AND (SELECT public.is_company_super_user()))) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS policy_ack_sel ON public.policy_acknowledgements;
CREATE POLICY policy_ack_sel ON public.policy_acknowledgements
  AS PERMISSIVE FOR SELECT TO public
  USING (((company_id = (SELECT public.my_company_id())) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_delete ON public.profiles
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (((SELECT public.is_tps_staff())));

DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((id = ( SELECT auth.uid() AS uid)) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((id = ( SELECT auth.uid() AS uid)) OR ((SELECT public.is_tps_staff()))));

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((id = ( SELECT auth.uid() AS uid)) OR ((SELECT public.is_tps_staff()))));
