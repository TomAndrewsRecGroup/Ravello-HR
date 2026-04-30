-- Custom invite tokens on profiles.
--
-- Replaces Supabase's built-in invite email (which embeds an access_token
-- with a 1-hour expiry in the email link). We now generate a UUID token
-- with a 7-day expiry, store it here, and send our own Resend email.
-- When the user clicks the link we validate this token, generate a fresh
-- Supabase magic link on-demand, and redirect through it — so the
-- 1-hour window only starts counting when the user actually clicks.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS invite_token            UUID,
  ADD COLUMN IF NOT EXISTS invite_token_expires_at TIMESTAMPTZ;

-- Fast unique lookup by token (partial: only rows that have one).
CREATE UNIQUE INDEX IF NOT EXISTS profiles_invite_token_idx
  ON profiles (invite_token)
  WHERE invite_token IS NOT NULL;
