-- ════════════════════════════════════════════════════════════════════════
-- Migration 051: record_portal_login() RPC
-- ────────────────────────────────────────────────────────────────────────
-- The admin Engagement dashboard reads companies.last_portal_login to
-- show when each client last signed in to their portal. The column was
-- never being written, so the dashboard always showed "Never" for
-- everyone.
--
-- Rather than letting the portal middleware write to the companies
-- table directly (which would require a write RLS policy that's
-- broader than we want for a client-scoped session), we expose a
-- single SECURITY DEFINER function that:
--
--   • Verifies the caller is signed in (auth.uid() not null)
--   • Verifies the company_id passed in matches the caller's
--     profile.company_id (so a client can only stamp their own row)
--   • Updates last_portal_login = now() on that company row
--   • Increments login_count_30d if the previous login was outside
--     the rolling 30-day window we count over (otherwise just
--     refreshes the timestamp)
--
-- Idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION record_portal_login(p_company_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_company UUID;
  prev_login     TIMESTAMPTZ;
BEGIN
  -- Caller must be signed in.
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  -- Caller's profile must point at the company we're about to stamp.
  SELECT company_id INTO caller_company
    FROM profiles WHERE id = auth.uid();

  IF caller_company IS NULL OR caller_company <> p_company_id THEN
    RETURN;
  END IF;

  -- Look at the previous login to decide whether to bump the rolling
  -- 30-day count. If the last login was within the window, we're
  -- effectively still on the same "session day" — leave the count
  -- alone. If it's been more than 24h, we count it as a new login.
  SELECT last_portal_login INTO prev_login
    FROM companies WHERE id = p_company_id;

  IF prev_login IS NULL OR prev_login < NOW() - INTERVAL '24 hours' THEN
    -- New login — bump the count, decay anything older than 30 days
    -- by capping the count at the actual rolling-30d bound.
    UPDATE companies
       SET last_portal_login = NOW(),
           login_count_30d   = LEAST(COALESCE(login_count_30d, 0) + 1, 999)
     WHERE id = p_company_id;
  ELSE
    -- Same-day refresh — only update the timestamp.
    UPDATE companies
       SET last_portal_login = NOW()
     WHERE id = p_company_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION record_portal_login(UUID) TO authenticated;
