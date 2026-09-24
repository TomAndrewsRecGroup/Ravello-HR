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
-- A column REVOKE cannot fix this: `authenticated` has table-level
-- UPDATE, and a column-level revoke does not subtract from that. So the
-- guard is a BEFORE trigger.
--
-- The trigger functions are SECURITY INVOKER on purpose. current_user
-- is then the role PostgREST switched to — 'authenticated' or 'anon'
-- for a browser/JWT caller — while the service role, the SQL editor
-- (postgres) and auth's own handle_new_user (a SECURITY DEFINER
-- function, so its owner) are unaffected. auth.uid() alone cannot make
-- that distinction: it is NULL for anon AND for the service role.
--
-- No legitimate client path changes these columns (checked 2026-09-24):
-- portal invites and staff role edits use the service role or a staff
-- session; the portal's SettingsForm / onboarding / friction-lens
-- company updates touch only name, sector, size_band, contact_email,
-- open_days, open_hours, timezone, currency, friction_*, ivylens_*.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── profiles: role and company are staff-only ──────────────────────

CREATE OR REPLACE FUNCTION public.profiles_guard_privileged()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;                       -- service role, SQL editor, auth hooks
  END IF;
  IF (SELECT public.is_tps_staff()) THEN
    RETURN NEW;                       -- staff manage roles from the admin app
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.role::text IN ('tps_admin', 'tps_client') THEN
      RAISE EXCEPTION 'Only Core OS 360 staff can create a staff profile'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Only Core OS 360 staff can change a user''s role'
      USING ERRCODE = '42501';
  END IF;
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Only Core OS 360 staff can move a user to another company'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_privileged ON public.profiles;
CREATE TRIGGER profiles_guard_privileged
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_privileged();

COMMENT ON FUNCTION public.profiles_guard_privileged() IS
  'Blocks non-staff JWT callers from setting profiles.role or profiles.company_id (088). SECURITY INVOKER so current_user identifies the PostgREST role.';

-- ── companies: commercial and identity columns are staff-only ──────

CREATE OR REPLACE FUNCTION public.companies_guard_commercial()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;                       -- service role (Stripe webhook, admin APIs), SQL editor
  END IF;
  IF (SELECT public.is_tps_staff()) THEN
    RETURN NEW;
  END IF;

  IF NEW.feature_flags          IS DISTINCT FROM OLD.feature_flags
  OR NEW.active                 IS DISTINCT FROM OLD.active
  OR NEW.archived_at            IS DISTINCT FROM OLD.archived_at
  OR NEW.slug                   IS DISTINCT FROM OLD.slug
  OR NEW.account_owner_id       IS DISTINCT FROM OLD.account_owner_id
  OR NEW.stripe_customer_id     IS DISTINCT FROM OLD.stripe_customer_id
  OR NEW.stripe_subscription_id IS DISTINCT FROM OLD.stripe_subscription_id
  OR NEW.stripe_price_id        IS DISTINCT FROM OLD.stripe_price_id
  OR NEW.monthly_retainer_pence IS DISTINCT FROM OLD.monthly_retainer_pence
  OR NEW.subscription_status    IS DISTINCT FROM OLD.subscription_status
  OR NEW.subscription_started_at IS DISTINCT FROM OLD.subscription_started_at
  OR NEW.billing_currency       IS DISTINCT FROM OLD.billing_currency
  THEN
    RAISE EXCEPTION 'Only Core OS 360 staff can change modules, billing or account status'
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
  'Blocks non-staff JWT callers from changing feature flags, billing, Stripe ids, slug, owner or active/archived state (088).';
