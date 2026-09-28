-- ═══════════════════════════════════════════════════════════════════
-- 140: my_capabilities() honours explicit-only capabilities (2026-09-28)
-- ═══════════════════════════════════════════════════════════════════
--
-- my_capabilities() (127) decides which buttons a page OFFERS. It asked
-- has_capability(), which gives staff every capability — including
-- occupational_health.clinical.read, which 132 made EXPLICIT-ONLY: the
-- clinical policies and bucket (135) use has_explicit_capability(), so
-- staff never read clinical records. The page and the database therefore
-- disagreed: staff were offered a clinical section whose reads return
-- nothing and whose writes are refused. No data was exposed (RLS held);
-- this makes what is offered match what is allowed.
--
-- Same function, still SECURITY INVOKER, same grants: every capability
-- in EXPLICIT_ONLY_CAPABILITIES (lib/auth/capabilities.ts) is tested
-- with has_explicit_capability; everything else as before.
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.my_capabilities()
RETURNS text[] LANGUAGE sql STABLE SET search_path = public, pg_temp AS $$
  SELECT COALESCE(array_agg(c.key ORDER BY c.key), '{}')
    FROM access_capabilities c
   WHERE CASE WHEN c.key IN ('occupational_health.clinical.read')
              THEN public.has_explicit_capability(public.my_company_id(), c.key)
              ELSE public.has_capability(public.my_company_id(), c.key) END
$$;
