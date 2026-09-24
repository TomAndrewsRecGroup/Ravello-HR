-- ═══════════════════════════════════════════════════════════════════
-- 088: stop signed-in users granting themselves privileges (2026-09-24)
-- ═══════════════════════════════════════════════════════════════════
--
-- Found while planning Health & Safety provider logins, verified live
-- against pg_policies / pg_trigger / information_schema:
--
--   * profiles_update is USING (id = auth.uid()) with no WITH CHECK,
--     there was no trigger on profiles, and `authenticated` holds
--     UPDATE on role and company_id. Any signed-in user could run
--     update({ role: 'tps_admin' }) on their own row from the browser
--     console, after which is_tps_staff() opened every table. Setting
--     company_id to another client's id moved them into that client.
--   * client_profiles_admin_manage let a client_admin do the same to a
--     colleague: its WITH CHECK looks only at company_id.
--   * client_company_update let a client_admin write feature_flags on
--     their own company, switching on any paid module.
--
-- The first version of this file guarded named columns. An adversarial
-- review the same day broke it four ways, each reproduced live in a
-- rolled-back transaction:
--
--   * DELETE your own profile, then INSERT it again with another
--     company's id: profiles_insert checks only id = auth.uid(), and the
--     guard's INSERT branch looked only at role.
--   * UPDATE your own profiles.email to someone about to be invited.
--     The invite routes resolved an existing account by profiles.email
--     and upserted company + role onto it with the service role, which
--     the guard exempts — the attacker became that client's admin.
--   * UPDATE a colleague's invite_token, then redeem it at
--     /api/auth/set-password: their password, your choice.
--   * UPDATE companies.manatal_client_id (or ivylens_company_id) to
--     another client's id: server routes then read that client's
--     candidates with the platform-wide API key.
--
-- So both guards are now ALLOW-LISTS. A non-staff caller may change only
-- the columns the product actually lets a client edit, and every other
-- column — including any column added later — is staff-only by default.
-- A non-staff caller may not INSERT or DELETE a profile at all: no
-- client path does either (handle_new_user and the invite routes run as
-- the table owner / service role, which the guard exempts).
--
-- A column REVOKE cannot do this: `authenticated` has table-level
-- UPDATE, and a column-level revoke does not subtract from that.
--
-- The trigger functions are SECURITY INVOKER on purpose. current_user
-- is then the role PostgREST switched to — 'authenticated' or 'anon'
-- for a browser/JWT caller — while the service role, the SQL editor
-- (postgres), auth's own handle_new_user and SECURITY DEFINER RPCs such
-- as record_portal_login (their owner) are unaffected. auth.uid() alone
-- cannot make that distinction: it is NULL for anon AND for the service
-- role.
--
-- Client-editable columns, from every user-session write in both apps
-- (checked 2026-09-24):
--   profiles:  full_name (settings, onboarding), ui_preferences,
--              onboarding_step / onboarding_completed (onboarding),
--              plus the self-service consent and avatar fields.
--   companies: name, sector, size_band, contact_email, open_days,
--              open_hours, timezone, currency (SettingsForm, onboarding).
-- The portal's IvyLens register / assessment routes wrote
-- ivylens_company_id / friction_* with the user's session; they now use
-- the service role after their own session check.
--
-- auth_user_id_by_email() lets the invite routes find an existing
-- account in auth.users — the only email a user cannot rewrite — instead
-- of in profiles. Service role only.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── profiles ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.profiles_guard_privileged()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  -- The ONLY columns a non-staff caller may change on a profile.
  self_service CONSTANT text[] := ARRAY[
    'full_name', 'avatar_url', 'ui_preferences',
    'onboarding_step', 'onboarding_completed',
    'privacy_consent_at', 'privacy_consent_version',
    'marketing_consent', 'data_processing_consent',
    'data_erasure_requested_at'
  ];
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

  SELECT string_agg(n.key, ', ' ORDER BY n.key) INTO changed
    FROM jsonb_each(to_jsonb(NEW) - self_service) n
   WHERE n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key);
  IF changed IS NOT NULL THEN
    RAISE EXCEPTION 'Only Core OS 360 staff can change % on a user', changed
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_privileged ON public.profiles;
CREATE TRIGGER profiles_guard_privileged
  BEFORE INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_privileged();

COMMENT ON FUNCTION public.profiles_guard_privileged() IS
  'Non-staff JWT callers may change only self-service profile columns, and may not insert or delete profiles (088). SECURITY INVOKER so current_user identifies the PostgREST role.';

-- ── companies ───────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.companies_guard_commercial()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  -- The ONLY columns a non-staff caller may change on their company.
  self_service CONSTANT text[] := ARRAY[
    'name', 'sector', 'size_band', 'contact_email',
    'open_days', 'open_hours', 'timezone', 'currency'
  ];
  changed text;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;                       -- service role (Stripe webhook, admin APIs), SQL editor
  END IF;
  IF (SELECT public.is_tps_staff()) THEN
    RETURN NEW;
  END IF;

  SELECT string_agg(n.key, ', ' ORDER BY n.key) INTO changed
    FROM jsonb_each(to_jsonb(NEW) - self_service) n
   WHERE n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key);
  IF changed IS NOT NULL THEN
    RAISE EXCEPTION 'Only Core OS 360 staff can change % on a company', changed
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS companies_guard_commercial ON public.companies;
CREATE TRIGGER companies_guard_commercial
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.companies_guard_commercial();

COMMENT ON FUNCTION public.companies_guard_commercial() IS
  'Non-staff JWT callers may change only a company''s self-service settings (088): name, sector, size, contact email, opening hours, timezone, currency.';

-- ── find an existing account by the email a user cannot rewrite ────

CREATE OR REPLACE FUNCTION public.auth_user_id_by_email(p_email text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT u.id
    FROM auth.users u
   WHERE lower(u.email) = lower(btrim(p_email))
   ORDER BY u.created_at
   LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.auth_user_id_by_email(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_user_id_by_email(text) TO service_role;

COMMENT ON FUNCTION public.auth_user_id_by_email(text) IS
  'Service role only. The invite routes resolve an existing account here, never by profiles.email (088).';
