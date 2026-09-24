-- ═══════════════════════════════════════════════════════════════════
-- 094: external Health & Safety providers and their client scopes
-- ═══════════════════════════════════════════════════════════════════
--
-- A provider is an outside organisation — a safety consultancy such as
-- Lighthouse Safety, a training company such as Kentec — whose users
-- log in to record H&S work for the clients they are assigned to.
--
-- THE DATABASE IS THE SECURITY BOUNDARY. A provider user holds a normal
-- Supabase JWT and can call PostgREST directly with it, so every rule
-- about what they may see or write lives here, in RLS and triggers, and
-- never only in an admin-app route.
--
--   * profiles.hs_provider_id links a user to a provider. A provider
--     profile has company_id NULL, so every existing client policy
--     (company_id = my_company_id()) already denies them — NULL = x is
--     never true.
--   * hs_provider_companies grants one provider access to one client,
--     for named scopes only (least privilege: a training company gets
--     'training', not the accident book), inside a date window.
--   * Providers get NO policy on companies, employee_records or
--     profiles. Those rows carry salary, NI numbers and Stripe ids;
--     what a provider legitimately needs comes from narrow SECURITY
--     DEFINER RPCs returning named columns (hs_my_companies here,
--     hs_workforce with training).
--   * Deactivating a provider (hs_providers.active = false) cuts off
--     every one of its users at once: my_hs_provider_id() returns NULL.
--
-- Requires 090 (user_role 'hs_provider'). No change to the profile
-- guard is needed: 093's allow-list makes every column not on the
-- self-service list — hs_provider_id included — staff-only, and refuses
-- any non-staff profile INSERT, so nobody can make themselves a provider.
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── providers ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.hs_providers (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 200),
  provider_type        text NOT NULL DEFAULT 'consultancy'
                         CHECK (provider_type IN ('consultancy', 'training', 'inspection', 'other')),
  contact_name         text CHECK (length(contact_name) <= 200),
  contact_email        text CHECK (length(contact_email) <= 320),
  contact_phone        text CHECK (length(contact_phone) <= 50),
  website              text CHECK (length(website) <= 500),
  -- The Athletes To Industry directory row for the same organisation,
  -- if there is one. A separate table on purpose: athletes can read
  -- training_providers, and nothing about a provider's clients belongs
  -- anywhere an athlete can read.
  training_provider_id uuid REFERENCES public.training_providers(id) ON DELETE SET NULL,
  active               boolean NOT NULL DEFAULT true,
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.hs_providers IS
  'External H&S providers (consultancies, training and inspection companies) whose users record work for assigned clients (094).';

-- ── the link from a login to a provider ─────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS hs_provider_id uuid REFERENCES public.hs_providers(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS profiles_hs_provider_id_idx
  ON public.profiles (hs_provider_id) WHERE hs_provider_id IS NOT NULL;

-- A provider belongs to no client company, and only a provider carries
-- a provider link. Revoking a user sets hs_provider_id NULL (and bans
-- the auth user); the role stays, and grants nothing on its own.
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_hs_provider_shape;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_hs_provider_shape CHECK (
  (hs_provider_id IS NULL OR role = 'hs_provider')
  AND (role <> 'hs_provider' OR company_id IS NULL)
);

-- ── assignments: which provider, which client, which scopes ─────────

CREATE TABLE IF NOT EXISTS public.hs_provider_companies (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id          uuid NOT NULL REFERENCES public.hs_providers(id) ON DELETE CASCADE,
  company_id           uuid NOT NULL REFERENCES public.companies(id)    ON DELETE CASCADE,
  scopes               text[] NOT NULL CHECK (
                         cardinality(scopes) > 0
                         AND scopes <@ ARRAY['register', 'documents', 'training', 'audits', 'incidents']::text[]
                       ),
  -- 'write' records work; 'read' can only look (e.g. a broker).
  access_level         text NOT NULL DEFAULT 'write' CHECK (access_level IN ('read', 'write')),
  status               text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'ended')),
  starts_on            date NOT NULL DEFAULT current_date,
  ends_on              date CHECK (ends_on IS NULL OR ends_on >= starts_on),
  -- Who at the client agreed to this provider seeing their H&S data.
  client_authorised_by text CHECK (length(client_authorised_by) <= 200),
  created_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider_id, company_id)
);

CREATE INDEX IF NOT EXISTS hs_provider_companies_company_idx
  ON public.hs_provider_companies (company_id);

COMMENT ON TABLE public.hs_provider_companies IS
  'Grants one H&S provider access to one client for named scopes inside a date window (094). Read by hs_can_access / hs_can_write.';

-- ── helpers ─────────────────────────────────────────────────────────
-- SECURITY DEFINER so a policy can call them without recursing through
-- the RLS of the tables they read. search_path pinned. EXECUTE only to
-- authenticated: anon has no business asking.

CREATE OR REPLACE FUNCTION public.my_hs_provider_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p.hs_provider_id
    FROM public.profiles p
    JOIN public.hs_providers hp ON hp.id = p.hs_provider_id AND hp.active
   WHERE p.id = auth.uid()
     AND p.role = 'hs_provider';
$$;

-- Read access to a client's H&S data for one scope.
CREATE OR REPLACE FUNCTION public.hs_can_access(p_company uuid, p_scope text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_tps_staff()
      OR EXISTS (
           SELECT 1
             FROM public.hs_provider_companies a
            WHERE a.provider_id = public.my_hs_provider_id()
              AND a.company_id  = p_company
              AND a.status      = 'active'
              AND p_scope       = ANY (a.scopes)
              AND a.starts_on  <= current_date
              AND (a.ends_on IS NULL OR a.ends_on >= current_date)
         );
$$;

-- Write access: the same, and the assignment is not read-only.
CREATE OR REPLACE FUNCTION public.hs_can_write(p_company uuid, p_scope text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_tps_staff()
      OR EXISTS (
           SELECT 1
             FROM public.hs_provider_companies a
            WHERE a.provider_id  = public.my_hs_provider_id()
              AND a.company_id   = p_company
              AND a.status       = 'active'
              AND a.access_level = 'write'
              AND p_scope        = ANY (a.scopes)
              AND a.starts_on   <= current_date
              AND (a.ends_on IS NULL OR a.ends_on >= current_date)
         );
$$;

-- Who is acting, for the timeline: 'staff' | 'provider' | 'client' | 'system'.
CREATE OR REPLACE FUNCTION public.hs_actor_kind()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT CASE
           WHEN auth.uid() IS NULL                  THEN 'system'
           WHEN public.is_tps_staff()               THEN 'staff'
           WHEN public.my_hs_provider_id() IS NOT NULL THEN 'provider'
           ELSE 'client'
         END;
$$;

-- The company a storage key belongs to: its first folder, or NULL if
-- that is not a uuid (so a policy comparing it simply fails).
CREATE OR REPLACE FUNCTION public.hs_path_company(p_name text)
RETURNS uuid
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN split_part(p_name, '/', 1)::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

-- The clients this user may work on, with only the columns a provider
-- needs. Staff see every active client with every scope.
CREATE OR REPLACE FUNCTION public.hs_my_companies()
RETURNS TABLE (company_id uuid, name text, sector text, scopes text[], access_level text, ends_on date)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT c.id, c.name, c.sector,
         ARRAY['register', 'documents', 'training', 'audits', 'incidents']::text[],
         'write'::text, NULL::date
    FROM public.companies c
   WHERE public.is_tps_staff() AND c.active
  UNION ALL
  SELECT c.id, c.name, c.sector, a.scopes, a.access_level, a.ends_on
    FROM public.hs_provider_companies a
    JOIN public.companies c ON c.id = a.company_id
   WHERE NOT public.is_tps_staff()
     AND a.provider_id = public.my_hs_provider_id()
     AND a.status = 'active'
     AND a.starts_on <= current_date
     AND (a.ends_on IS NULL OR a.ends_on >= current_date)
     AND c.active
   ORDER BY 2;
$$;

REVOKE ALL ON FUNCTION public.my_hs_provider_id()           FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hs_can_access(uuid, text)     FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hs_can_write(uuid, text)      FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hs_actor_kind()               FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.hs_my_companies()             FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_hs_provider_id()        TO authenticated;
GRANT EXECUTE ON FUNCTION public.hs_can_access(uuid, text)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.hs_can_write(uuid, text)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.hs_actor_kind()            TO authenticated;
GRANT EXECUTE ON FUNCTION public.hs_my_companies()          TO authenticated;

-- ── RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.hs_providers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hs_provider_companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS hs_providers_staff_all      ON public.hs_providers;
DROP POLICY IF EXISTS hs_providers_provider_self  ON public.hs_providers;
DROP POLICY IF EXISTS hs_providers_client_read    ON public.hs_providers;
CREATE POLICY hs_providers_staff_all ON public.hs_providers
  FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
CREATE POLICY hs_providers_provider_self ON public.hs_providers
  FOR SELECT TO authenticated
  USING (id = (SELECT public.my_hs_provider_id()));
-- A client sees who can see and record their H&S data.
CREATE POLICY hs_providers_client_read ON public.hs_providers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.hs_provider_companies a
     WHERE a.provider_id = hs_providers.id
       AND a.company_id  = (SELECT public.my_company_id())
  ));

DROP POLICY IF EXISTS hs_provider_companies_staff_all     ON public.hs_provider_companies;
DROP POLICY IF EXISTS hs_provider_companies_provider_read ON public.hs_provider_companies;
DROP POLICY IF EXISTS hs_provider_companies_client_read   ON public.hs_provider_companies;
CREATE POLICY hs_provider_companies_staff_all ON public.hs_provider_companies
  FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));
CREATE POLICY hs_provider_companies_provider_read ON public.hs_provider_companies
  FOR SELECT TO authenticated
  USING (provider_id = (SELECT public.my_hs_provider_id()));
CREATE POLICY hs_provider_companies_client_read ON public.hs_provider_companies
  FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));
