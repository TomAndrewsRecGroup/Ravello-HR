-- Core-OS 360 Phase 6, Group 1: consultancy portfolio access foundation.
--
-- Before Phase 6 can build a cross-client command centre, two real gaps
-- found by the pre-work investigation (not hypothetical — read from the
-- live functions before writing this) must close, because every later
-- Phase 6 view depends on "a consultant sees only organisations for
-- which they hold valid, active access" being true right now:
--
-- 1. RELATIONSHIP EXPIRY DOES NOT CASCADE. `grant_organisation_access`
--    records `via_relationship_id`, but `my_organisations()`,
--    `my_active_grant()`, `has_capability()` and `set_active_organisation()`
--    never re-check that the underlying `organisation_relationships` row
--    is still active. If Laws Safety's contract with a client ends
--    (relationship status -> 'ended', or its `valid_until` passes) every
--    grant issued under it stays live until someone remembers to revoke
--    it by hand. Fixed here with one predicate,
--    `grant_relationship_current()`, applied everywhere a grant's
--    validity is checked — a grant with no `via_relationship_id` (a
--    direct/staff grant) is unaffected; one with a relationship must
--    also find that relationship still 'active' and within its own date
--    window.
-- 2. NO PORTFOLIO READ EXISTS. Every existing cross-client admin view is
--    staff-only (`is_tps_staff()`); RLS resolves through single-valued
--    `my_company_id()` throughout the portal — COMPANIES included, so
--    even a bare SELECT against `companies` only ever returns the
--    caller's currently ACTIVE organisation. There is no function that
--    answers "list every organisation I may currently act in" without
--    switching into each one first. `portfolio_organisations()` is that
--    function, and every later Phase 6 cross-client aggregate is built
--    the same way: a SECURITY DEFINER function doing its own
--    auth.uid()-scoped grant check (the my_organisations() shape),
--    never a client-side loop of ordinary RLS-scoped queries, which
--    would silently return nothing for every organisation but the
--    active one.

-- ── grant_relationship_current(): NULL via_relationship_id (a direct or
--    staff-issued grant) is always current; a relationship-derived one
--    needs the relationship itself still 'active' and in its own window.
CREATE OR REPLACE FUNCTION public.grant_relationship_current(p_via_relationship_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT p_via_relationship_id IS NULL OR EXISTS (
    SELECT 1 FROM organisation_relationships r
     WHERE r.id = p_via_relationship_id
       AND r.status = 'active'
       AND r.valid_from <= current_date
       AND (r.valid_until IS NULL OR r.valid_until >= current_date)
  )
$$;
REVOKE ALL ON FUNCTION public.grant_relationship_current(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_relationship_current(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_active_grant()
RETURNS TABLE(organisation_id uuid, role_key text, legacy_role text, read_only boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT g.organisation_id, g.role_key, r.legacy_role, r.read_only
    FROM user_active_organisation a
    JOIN user_organisation_access g ON g.user_id = a.user_id AND g.organisation_id = a.organisation_id
    JOIN access_roles r ON r.key = g.role_key
   WHERE a.user_id = auth.uid()
     AND g.active_status = 'active'
     AND g.valid_from <= now()
     AND (g.valid_until IS NULL OR g.valid_until > now())
     AND public.grant_relationship_current(g.via_relationship_id)
   LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.has_capability(p_org uuid, p_cap text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
              AND (g.valid_until IS NULL OR g.valid_until > now())
              AND public.grant_relationship_current(g.via_relationship_id)))
  END
$$;

CREATE OR REPLACE FUNCTION public.set_active_organisation(p_org uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE home uuid; prev uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501'; END IF;
  SELECT company_id INTO home FROM profiles WHERE id = auth.uid();
  prev := public.my_company_id();
  IF p_org IS NULL OR p_org IS NOT DISTINCT FROM home THEN
    DELETE FROM user_active_organisation WHERE user_id = auth.uid();
  ELSE
    IF public.is_tps_staff() THEN
      IF NOT EXISTS (SELECT 1 FROM companies WHERE id = p_org AND archived_at IS NULL) THEN
        RAISE EXCEPTION 'No access to that organisation' USING ERRCODE = '42501';
      END IF;
    ELSIF NOT EXISTS (
      SELECT 1 FROM user_organisation_access g
       WHERE g.user_id = auth.uid() AND g.organisation_id = p_org AND g.active_status = 'active'
         AND g.valid_from <= now() AND (g.valid_until IS NULL OR g.valid_until > now())
         AND public.grant_relationship_current(g.via_relationship_id)) THEN
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

CREATE OR REPLACE FUNCTION public.my_organisations()
RETURNS TABLE(organisation_id uuid, name text, organisation_type text, role_key text, is_home boolean, is_active boolean)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT c.id, c.name, c.organisation_type, public.my_home_role_key(), true, c.id = public.my_company_id()
    FROM profiles p JOIN companies c ON c.id = p.company_id
   WHERE p.id = auth.uid()
  UNION ALL
  SELECT c.id, c.name, c.organisation_type, g.role_key, false, c.id = public.my_company_id()
    FROM user_organisation_access g JOIN companies c ON c.id = g.organisation_id
   WHERE g.user_id = auth.uid() AND g.active_status = 'active'
     AND g.valid_from <= now() AND (g.valid_until IS NULL OR g.valid_until > now())
     AND public.grant_relationship_current(g.via_relationship_id)
     AND c.archived_at IS NULL
  UNION ALL
  SELECT c.id, c.name, c.organisation_type, 'platform_super_admin', false, c.id = public.my_company_id()
    FROM companies c
   WHERE public.is_tps_staff() AND c.archived_at IS NULL
  ORDER BY 5 DESC, 2
$$;

-- ── portfolio_organisations(): the ONE cross-client read every Phase 6
--    view is built on. SECURITY DEFINER, matching my_organisations()'s
--    own established pattern — NOT because it needs elevated privilege,
--    but because plain RLS cannot answer this question at all: every
--    RLS-gated table in this schema (companies included) resolves
--    through the single-valued my_company_id(), so a SECURITY INVOKER
--    version of this function would see only the caller's currently
--    ACTIVE organisation, not their whole portfolio — proven live: the
--    first version of this function was INVOKER and its own probe
--    caught it returning zero rows for an authorised-but-not-active
--    client. The function does its OWN auth.uid()-scoped filtering
--    (identical predicate to my_organisations()'s own grant branch),
--    so it can never return more than that session's valid grants
--    permit — the same trusted shape my_organisations() already is.
--    Excludes the caller's own home organisation (that is "my own
--    company", not a portfolio client) and does NOT expand to every
--    company for staff — the Command Centre is for grant-holding
--    consultancy accounts; staff already have every other cross-client
--    admin view in this codebase and are not the audience this serves.
CREATE OR REPLACE FUNCTION public.portfolio_organisations()
RETURNS TABLE(organisation_id uuid, name text, organisation_type text, role_key text, access_scope text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT c.id, c.name, c.organisation_type, g.role_key, g.access_scope
    FROM user_organisation_access g JOIN companies c ON c.id = g.organisation_id
   WHERE g.user_id = auth.uid() AND g.active_status = 'active'
     AND g.valid_from <= now() AND (g.valid_until IS NULL OR g.valid_until > now())
     AND public.grant_relationship_current(g.via_relationship_id)
     AND c.archived_at IS NULL
   ORDER BY c.name
$$;
REVOKE ALL ON FUNCTION public.portfolio_organisations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portfolio_organisations() TO authenticated;

-- ── access_scope enforcement (Phase 1 debt H.2: "recorded but not
--    enforced"). A scope narrower than 'full' limits which CAPABILITIES
--    a grant carries within that one organisation — it never widens
--    anything has_capability() would otherwise refuse. 'health_safety'
--    keeps H&S/asset/environmental/register capabilities only,
--    'hr' keeps people/HR/workforce/training capabilities only,
--    'recruitment' keeps recruitment.manage plus baseline read access.
--    'full' is unrestricted (today's behaviour, unchanged).
CREATE OR REPLACE FUNCTION public.access_scope_allows(p_scope text, p_cap text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE p_scope
    WHEN 'full' THEN true
    WHEN 'health_safety' THEN p_cap = ANY(ARRAY[
      'organisation.read','site.read','people.read',
      'risk.read','risk.create','risk.approve',
      'incident.create','incident.investigate','incident.read','incident.sensitive.read','incident.approve',
      'riddor.review','hazard.report','hazard.manage','templates.manage',
      'contractors.manage','documents.manage','training.manage',
      'workforce.read','workforce.manage','workforce.verify_safety_critical',
      'training.verify','competency.assess','competency.verify','deployment.exception.approve',
      'asset.read','asset.manage','inspection.perform',
      'environmental.read','environmental.manage',
      'actions.assign','audit.read','consultancy.client_access'])
    WHEN 'hr' THEN p_cap = ANY(ARRAY[
      'organisation.read','site.read','people.read',
      'hr.sensitive.read','hr.sensitive.write',
      'training.manage','documents.manage',
      'occupational_health.summary.read','occupational_health.clinical.read','occupational_health.manage',
      'actions.assign','audit.read','consultancy.client_access'])
    WHEN 'recruitment' THEN p_cap = ANY(ARRAY[
      'organisation.read','site.read','people.read',
      'recruitment.manage','actions.assign','audit.read','consultancy.client_access'])
    ELSE true
  END
$$;
-- Pure, stateless vocabulary lookup (two text args, a static CASE) with
-- no privileged data access — safe to leave callable, the same posture
-- every other deterministic helper (hs_entity_table, hs_scope_for_entity)
-- already takes. Called both from has_capability() (SECURITY DEFINER,
-- runs regardless) and directly by the Phase 6 UI to explain a scoped
-- grant's own limits, and by this migration's own probe.
GRANT EXECUTE ON FUNCTION public.access_scope_allows(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.has_capability(p_org uuid, p_cap text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
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
              AND (g.valid_until IS NULL OR g.valid_until > now())
              AND public.grant_relationship_current(g.via_relationship_id)
              AND public.access_scope_allows(g.access_scope, p_cap)))
  END
$$;

-- ── New capability: consultancy.service_manage. `consultancy.client_access`
--    (held by both consultancy_owner and consultant since Phase 1)
--    already gates "may I open this client through the consultancy
--    path" — reused unchanged as the Phase 6 view-gate. This one new
--    capability gates the Phase 6 WRITE actions (service scope, manual
--    ledger entries, visit scheduling) — distinct from
--    consultancy.manage_access, which is about managing WHO has access,
--    not managing service delivery for a client already granted.
INSERT INTO public.access_capabilities (key, description, sensitive) VALUES
  ('consultancy.service_manage', 'Manage service scope, visits and the service ledger for an authorised client', false)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.access_role_capabilities (role_key, capability_key)
SELECT r, c FROM (VALUES
  ('consultancy.service_manage', ARRAY['platform_super_admin','platform_staff','consultancy_owner','consultant'])
) AS m(c, roles), unnest(m.roles) AS r
ON CONFLICT DO NOTHING;

-- ── audit_events entity types this phase adds, for anyone reading the
--    audit trail's own vocabulary: consultancy.client_accessed,
--    service_scope.updated, client_roadmap.updated, value_report.generated,
--    service_ledger.entry_created. audit_events.action is free text
--    (no CHECK), so nothing to alter here — recorded for the handover.
