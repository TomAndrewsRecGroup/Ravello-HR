-- ═══════════════════════════════════════════════════════════
-- Phase 57: Enquiries table
--
-- Single canonical capture for every form submission on the
-- marketing site (free tools, contact forms, future intake).
--
-- Replaces the older /api/leads flow for tool submissions:
-- legacy `leads` table left in place for compatibility but new
-- writes go to `enquiries`.
--
-- Surfaced in the admin portal via the topbar Enquiries icon.
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS enquiries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  phone         TEXT,
  company_name  TEXT,
  source        TEXT NOT NULL,                 -- hiring_score, hr_risk, policy_healthcheck, due_diligence, contact, ...
  result        JSONB DEFAULT '{}',            -- score / percentage / weak areas / answers etc.
  status        TEXT NOT NULL DEFAULT 'new'    -- new | contacted | booked | closed
                CHECK (status IN ('new','contacted','booked','closed')),
  notes         TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_enquiries_created ON enquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enquiries_source  ON enquiries (source);
CREATE INDEX IF NOT EXISTS idx_enquiries_status  ON enquiries (status);
CREATE INDEX IF NOT EXISTS idx_enquiries_email   ON enquiries (email);

ALTER TABLE enquiries ENABLE ROW LEVEL SECURITY;

-- TPS staff can read and update every enquiry
DROP POLICY IF EXISTS enquiries_staff_read ON enquiries;
CREATE POLICY enquiries_staff_read ON enquiries
  FOR SELECT
  USING (is_tps_staff());

DROP POLICY IF EXISTS enquiries_staff_update ON enquiries;
CREATE POLICY enquiries_staff_update ON enquiries
  FOR UPDATE
  USING (is_tps_staff())
  WITH CHECK (is_tps_staff());

-- Inserts go through the marketing site service-role client (no
-- anonymous public insert policy: keeps the table off the public
-- supabase API surface).

CREATE TRIGGER enquiries_set_updated_at
  BEFORE UPDATE ON enquiries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
