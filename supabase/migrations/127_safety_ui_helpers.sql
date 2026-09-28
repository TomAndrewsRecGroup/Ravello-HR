-- ═══════════════════════════════════════════════════════════════════
-- 127: two read helpers for the PROTECT safety screens (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- my_capabilities() — the capability keys the caller holds in the
-- organisation they are ACTING in (my_company_id()). The screens use it
-- only to decide which buttons to offer; every write is still decided by
-- RLS and the 122-126 guards, so a wrong answer here can hide a button,
-- never grant anything. SECURITY INVOKER: it is has_capability() per key.
--
-- org_directory() — the people who can act in the caller's ACTIVE
-- organisation (home members and live grants: consultants, advisers),
-- by id and display name only ("Unnamed user" when a profile has no
-- name — never any part of an email address), for owner / assessor /
-- verifier pickers.
-- DEFINER because a client cannot read a consultant's profile row; it
-- returns nothing for any organisation but the caller's active one, and
-- no email, phone or role detail. Staff get the same list for the
-- organisation they are working in.
--
-- Applied as 127, then re-applied as 127b the same day: the first
-- version fell back to the local part of the email address for a
-- nameless profile (caught by safetyApiSql.test.ts before commit).
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.my_capabilities()
RETURNS text[] LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg(c.key ORDER BY c.key), '{}')
    FROM access_capabilities c
   WHERE public.has_capability(public.my_company_id(), c.key)
$$;
REVOKE ALL ON FUNCTION public.my_capabilities() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_capabilities() TO authenticated;

CREATE OR REPLACE FUNCTION public.org_directory()
RETURNS TABLE (user_id uuid, full_name text, via_grant boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH org AS (SELECT public.my_company_id() AS id)
  SELECT p.id, COALESCE(NULLIF(btrim(p.full_name), ''), 'Unnamed user'), false
    FROM profiles p, org
   WHERE auth.uid() IS NOT NULL AND org.id IS NOT NULL AND p.company_id = org.id
  UNION
  SELECT p.id, COALESCE(NULLIF(btrim(p.full_name), ''), 'Unnamed user'), true
    FROM user_organisation_access g JOIN profiles p ON p.id = g.user_id, org
   WHERE auth.uid() IS NOT NULL AND org.id IS NOT NULL AND g.organisation_id = org.id
     AND g.active_status = 'active' AND g.valid_from <= now() AND (g.valid_until IS NULL OR g.valid_until > now())
$$;
REVOKE ALL ON FUNCTION public.org_directory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_directory() TO authenticated;
