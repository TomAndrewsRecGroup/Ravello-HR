-- ── Athlete referral source ─────────────────────────────────────────────
-- Adds a `source` marker so athletes submitted through the public per-client
-- referral link (/r/athlete/[slug]) can be distinguished from those entered
-- by a logged-in client or admin. Defaults to 'client' for all existing rows.
-- Public submissions are inserted via the service-role client with
-- created_by = NULL (already nullable) and source = 'referral'.

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'client';

COMMENT ON COLUMN athletes.source IS 'Origin of the athlete row: client | referral';
