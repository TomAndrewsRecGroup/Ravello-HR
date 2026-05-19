-- ═══════════════════════════════════════════════════════════
-- Phase 74: Email log (TPS-staff outbound audit trail)
--
-- Every manual email a staff member sends (Dev Plan, candidate
-- share, custom message) is recorded here so the recipient's
-- profile (athlete or client) shows a complete communication
-- history. Lets us answer "what did we last send them?" and
-- guards against double-sending.
--
-- target_type drives which UI surface lists the row:
--   athlete  → AthleteProfileModal activity panel
--   company  → ClientDetailTabs Overview activity panel
--   candidate → admin requisition / candidate view
--
-- Attachments are stored as metadata only (filename, size, mime).
-- The actual file bytes are NOT persisted — they only live for the
-- duration of the send request via the Resend or nodemailer
-- transport. Recipients are emailed the file directly.
--
-- TPS staff only — no client portal exposure.
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE email_log_target AS ENUM ('athlete', 'company', 'candidate');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS email_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type   email_log_target NOT NULL,
  target_id     UUID NOT NULL,
  company_id    UUID REFERENCES companies(id) ON DELETE SET NULL,
  -- When target_type='company', profile_id is the specific portal
  -- user we sent to (clients have multiple users). NULL when sent
  -- to a free-text recipient.
  profile_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  to_email      TEXT NOT NULL,
  subject       TEXT NOT NULL,
  body_html     TEXT NOT NULL,
  -- [{ name, size, mime }] — metadata only, no blobs.
  attachments   JSONB,
  sender_kind   TEXT NOT NULL CHECK (sender_kind IN ('resend','smtp')),
  sender_email  TEXT NOT NULL,
  sent_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  provider_id   TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS email_log_target_idx   ON email_log(target_type, target_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS email_log_company_idx  ON email_log(company_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS email_log_sent_by_idx  ON email_log(sent_by, sent_at DESC);

ALTER TABLE email_log ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT polname FROM pg_policy WHERE polname LIKE 'email_log_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON email_log', pol.polname);
  END LOOP;
END $$;

-- TPS staff only. No client read.
CREATE POLICY email_log_staff_all ON email_log
  FOR ALL TO authenticated
  USING      ((SELECT public.is_tps_staff()))
  WITH CHECK ((SELECT public.is_tps_staff()));
