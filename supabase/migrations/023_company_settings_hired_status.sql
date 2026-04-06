-- ══════════════════════════════════════════════════════════════
--  Migration 023: Company settings + hired candidate status
--
--  Adds company-level settings for calendar/timezone/currency.
--  Adds 'hired' to candidate_client_status enum.
-- ══════════════════════════════════════════════════════════════

-- Company settings columns
ALTER TABLE companies ADD COLUMN IF NOT EXISTS open_days    JSONB DEFAULT '["mon","tue","wed","thu","fri"]';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS open_hours   JSONB DEFAULT '{"start":"09:00","end":"17:30"}';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS timezone     TEXT  DEFAULT 'Europe/London';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS currency     TEXT  DEFAULT 'GBP';

-- Add 'hired' to candidate_client_status enum if it doesn't exist
DO $$ BEGIN
  ALTER TYPE candidate_client_status ADD VALUE IF NOT EXISTS 'hired';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
