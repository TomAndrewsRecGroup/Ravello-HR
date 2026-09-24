-- ═══════════════════════════════════════════════════════════════════
-- 092: clear the readable copies of set-password tokens (2026-09-24)
-- ═══════════════════════════════════════════════════════════════════
--
-- APPLY AFTER THE CODE FROM THE SAME PR HAS DEPLOYED. Before that, the
-- live app still writes and redeems profiles.invite_token; clearing it
-- first would break every invite sent in between.
--
-- 091 copied live tokens into profile_access_tokens as hashes, and the
-- new code reads and writes only that table. What is left in
-- profiles.invite_token is a plain-text token any client_admin in the
-- same company can SELECT — the defect 091 exists to remove. The
-- columns themselves stay (generated types reference them); nothing
-- writes them any more.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- Anything minted by the old code between 091 and the deploy.
INSERT INTO public.profile_access_tokens (token_hash, profile_id, purpose, expires_at)
SELECT encode(sha256(convert_to(lower(p.invite_token::text), 'UTF8')), 'hex'),
       p.id, 'invite', p.invite_token_expires_at
  FROM public.profiles p
 WHERE p.invite_token IS NOT NULL
   AND p.invite_token_expires_at > now()
ON CONFLICT (token_hash) DO NOTHING;

UPDATE public.profiles
   SET invite_token = NULL, invite_token_expires_at = NULL
 WHERE invite_token IS NOT NULL OR invite_token_expires_at IS NOT NULL;
