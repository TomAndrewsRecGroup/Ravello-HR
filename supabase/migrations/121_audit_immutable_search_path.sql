-- ═══════════════════════════════════════════════════════════════════
-- 121: pin search_path on audit_events_immutable (2026-09-26)
-- ═══════════════════════════════════════════════════════════════════
-- Supabase security advisor (0011) after 117: the append-only guard on
-- audit_events had a role-mutable search_path. It references nothing but
-- RAISE, so this is hygiene, not a hole — pinned anyway so the advisor
-- stays a useful signal.
ALTER FUNCTION public.audit_events_immutable() SET search_path = pg_catalog, pg_temp;
