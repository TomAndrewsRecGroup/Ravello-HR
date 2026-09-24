-- ═══════════════════════════════════════════════════════════════════
-- 093: follow-ups from the second security review (2026-09-24)
-- ═══════════════════════════════════════════════════════════════════
--
-- Each verified against the live database before fixing:
--
--   1. prune_latest_updates() is SECURITY DEFINER and anon/authenticated
--      could EXECUTE it. 060 revoked it FROM PUBLIC, but Supabase's
--      default privileges grant EXECUTE to anon and authenticated BY
--      NAME, so that revoke removed nothing. Anyone with the public anon
--      key could run the cron's staff-only delete with any age >= 30
--      days. Only the cron (service role) calls it.
--   2. bd_leads_view is owned by postgres (which bypasses RLS) and was
--      not security_invoker, so the staff-only RLS on bd_companies and
--      bd_scanned_roles never applied through it — and anon could SELECT
--      it. No code reads it. It becomes security_invoker and loses its
--      anon/authenticated grants.
--   3. 088's profile allow-list was per column, not per row: a
--      client_admin could still set a COLLEAGUE's consent, erasure-
--      request, onboarding and preference fields (client_profiles_admin_
--      manage lets them UPDATE the row) — recording GDPR consent in
--      someone else's name. The self-service columns are now yours alone;
--      a non-staff caller may change nothing on anybody else's profile.
--      No client path edits another user's profile (checked 2026-09-24).
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1 ───────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.prune_latest_updates(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_latest_updates(integer) TO service_role;

-- ── 2 ───────────────────────────────────────────────────────────────
ALTER VIEW public.bd_leads_view SET (security_invoker = true);
REVOKE ALL ON public.bd_leads_view FROM PUBLIC, anon, authenticated;

-- ── 3: 088's guard, with the allow-list applying to your own row only ──
CREATE OR REPLACE FUNCTION public.profiles_guard_privileged()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  -- The ONLY columns a non-staff caller may change — and only on their
  -- OWN profile. On anybody else's row the list is empty.
  self_service CONSTANT text[] := ARRAY[
    'full_name', 'avatar_url', 'ui_preferences',
    'onboarding_step', 'onboarding_completed',
    'privacy_consent_at', 'privacy_consent_version',
    'marketing_consent', 'data_processing_consent',
    'data_erasure_requested_at'
  ];
  allowed text[];
  changed text;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN COALESCE(NEW, OLD);        -- service role, SQL editor, auth hooks, DEFINER RPCs
  END IF;
  IF (SELECT public.is_tps_staff()) THEN
    RETURN COALESCE(NEW, OLD);        -- staff manage users from the admin app
  END IF;

  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Profiles are created by invitation only'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Only Core OS 360 staff can remove a user'
      USING ERRCODE = '42501';
  END IF;

  allowed := CASE WHEN OLD.id = (SELECT auth.uid()) THEN self_service ELSE ARRAY[]::text[] END;

  SELECT string_agg(n.key, ', ' ORDER BY n.key) INTO changed
    FROM jsonb_each(to_jsonb(NEW) - allowed) n
   WHERE n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key);
  IF changed IS NOT NULL THEN
    RAISE EXCEPTION 'Only Core OS 360 staff can change % on % profile', changed,
      CASE WHEN OLD.id = (SELECT auth.uid()) THEN 'a' ELSE 'another user''s' END
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.profiles_guard_privileged() IS
  'Non-staff JWT callers may change only self-service columns, only on their own profile, and may not insert or delete profiles (088, 093). SECURITY INVOKER so current_user identifies the PostgREST role.';
