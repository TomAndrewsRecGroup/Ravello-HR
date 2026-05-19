-- ═══════════════════════════════════════════════════════════
-- Phase 73: Athlete welcome-email tracking
--
-- The Athletes To Industry welcome email is normally queued by
-- Resend to fire 2 days after the athlete is added (Phase 71).
-- Admin staff also need a manual 'Send invite to call' button so
-- they can backfill the email for athletes added before the
-- automation went live (or resend on demand).
--
-- We track when + by whom so the UI can show 'Sent <date> by <staff>'
-- and prevent accidental double-sends.
--
-- Idempotent.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS welcome_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS welcome_email_sent_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
