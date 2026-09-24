-- ═══════════════════════════════════════════════════════════════════
-- 091: set-password tokens move out of reach (2026-09-24)
-- ═══════════════════════════════════════════════════════════════════
--
-- Found by the second adversarial review of the 088 hotfix. Invite and
-- staff-issued reset tokens lived in profiles.invite_token, in plain
-- text. client_profiles_admin_manage lets a client_admin SELECT every
-- profile in their company, so when staff sent an active user a reset,
-- any admin there could read the token and redeem it at
-- /api/auth/set-password, setting the colleague's password. Unredeemed
-- tokens were never cleared, so "has a token" also came to mean "pending
-- invite" permanently, which the portal's resend path then trusted.
--
-- A column REVOKE cannot hide invite_token (authenticated has table-
-- level SELECT). So the token leaves the table:
--
--   * profile_access_tokens stores SHA-256(token) — never the token —
--     with RLS on and NO policies, and every privilege revoked from
--     anon/authenticated. Only the service role touches it
--     (lib/auth/accessTokens.ts, shared by both apps).
--   * Several live tokens per account are allowed, so a resend never
--     kills the link already in someone's inbox; redeeming one deletes
--     them all (DELETE … RETURNING is the single-use claim).
--   * Live tokens are carried over, hashed, so an invite already in
--     somebody's inbox keeps working after the deploy.
--
-- 092 clears profiles.invite_token AFTER the code that stops writing it
-- has deployed (the same apply-after-deploy rule as 087).
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.profile_access_tokens (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('invite', 'reset')),
  expires_at timestamptz NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profile_access_tokens_profile_idx
  ON public.profile_access_tokens (profile_id);

ALTER TABLE public.profile_access_tokens ENABLE ROW LEVEL SECURITY;
-- No policies, on purpose: RLS on + no policy = no rows for anyone but
-- the service role (and the table owner). The revoke is belt and braces.
REVOKE ALL ON public.profile_access_tokens FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.profile_access_tokens IS
  'SHA-256 of single-use set-password tokens (invite / reset). Service role only: RLS on, no policies (091).';

-- Carry over tokens that are still live. crypto.randomUUID() is
-- lowercase and the uuid text form is lowercase, so the hash matches
-- what hashAccessToken() computes from the emailed link.
INSERT INTO public.profile_access_tokens (token_hash, profile_id, purpose, expires_at)
SELECT encode(sha256(convert_to(lower(p.invite_token::text), 'UTF8')), 'hex'),
       p.id, 'invite', p.invite_token_expires_at
  FROM public.profiles p
 WHERE p.invite_token IS NOT NULL
   AND p.invite_token_expires_at > now()
ON CONFLICT (token_hash) DO NOTHING;
