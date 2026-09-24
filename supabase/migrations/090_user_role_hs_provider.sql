-- ═══════════════════════════════════════════════════════════════════
-- 090: user_role gains 'hs_provider' (2026-09-24)
-- ═══════════════════════════════════════════════════════════════════
--
-- The login for an external Health & Safety provider (a consultancy or
-- training company) working for one or more assigned clients. Nothing
-- grants or reads it yet; 091 adds the provider tables, the scoping
-- helpers and the CHECK that a provider profile has no company_id.
--
-- Alone in its own file because a value added by ALTER TYPE … ADD VALUE
-- cannot be USED in the transaction that adds it, and 091 uses it.
--
-- Inert until staff grant it: 088's guard refuses every non-staff
-- profile INSERT and every non-staff change to profiles.role.
--
-- statusMaps.ts USER_ROLES / ROLE_LABELS carry it (both apps).
-- ═══════════════════════════════════════════════════════════════════

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'hs_provider';
