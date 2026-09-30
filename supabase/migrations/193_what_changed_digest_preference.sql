-- Core-OS 360 Completion Programme, Phase 25, Group 5 (closes gap-ledger
-- row C9.5 — "scheduled daily/period digest with preference/role
-- controls + dedup").
--
-- Group 4 (C9.4) built the on-demand client-facing What Changed page;
-- this closes the "scheduled" half. A brand-new digest nobody has asked
-- for yet is EXPLICIT OPT-IN — deliberately unlike weekly_summary's own
-- DEFAULT TRUE (096), which was turning on an existing, already-known
-- H&S habit for every client_admin. Defaulting this one on would
-- surprise every existing client_admin with a new email tomorrow; 'off'
-- is the safe default, the same caution this codebase already applies
-- to brand-new automation (IvyLens ai_assist, referral dry_run).

ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS what_changed_digest text NOT NULL DEFAULT 'off'
  CHECK (what_changed_digest IN ('off', 'daily', 'weekly'));
