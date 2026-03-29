-- ══════════════════════════════════════════════════════════════
--  Migration 004: Phase 15 — HIRE Enhancements
--  Offers table + Interview Schedules
-- ══════════════════════════════════════════════════════════════

-- ── Offers ───────────────────────────────────────────────────
-- Tracks offer lifecycle per candidate/requisition

CREATE TABLE IF NOT EXISTS offers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requisition_id    UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  candidate_id      UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Offer terms
  base_salary       INTEGER,          -- annual, in pence
  bonus             TEXT,             -- e.g. "10% discretionary"
  benefits          TEXT,             -- free text summary
  start_date        DATE,
  notice_period     TEXT,             -- e.g. "1 month"
  contract_type     TEXT,             -- 'permanent' | 'fixed_term' | 'contract'
  working_model     TEXT,             -- 'office' | 'hybrid' | 'remote'
  location          TEXT,

  -- Status tracking
  status            TEXT NOT NULL DEFAULT 'draft',
  -- 'draft' | 'sent' | 'verbal_accepted' | 'written_accepted' | 'declined' | 'withdrawn' | 'lapsed'

  -- Dates
  sent_at           TIMESTAMPTZ,
  verbal_accepted_at TIMESTAMPTZ,
  written_accepted_at TIMESTAMPTZ,
  declined_at       TIMESTAMPTZ,
  withdrawn_at      TIMESTAMPTZ,
  deadline          DATE,             -- offer expiry date

  -- Notes
  decline_reason    TEXT,
  notes             TEXT,
  created_by        UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_offers_requisition ON offers(requisition_id);
CREATE INDEX IF NOT EXISTS idx_offers_candidate   ON offers(candidate_id);
CREATE INDEX IF NOT EXISTS idx_offers_company     ON offers(company_id);
CREATE INDEX IF NOT EXISTS idx_offers_status      ON offers(status);

CREATE TRIGGER offers_updated_at
  BEFORE UPDATE ON offers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Interview Schedules ───────────────────────────────────────
-- Tracks interview stages per candidate

CREATE TABLE IF NOT EXISTS interview_schedules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requisition_id  UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  candidate_id    UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  stage_number    INTEGER NOT NULL DEFAULT 1,   -- 1st, 2nd, 3rd interview
  stage_label     TEXT,                          -- e.g. "Competency Interview", "Final Panel"
  interview_type  TEXT,                          -- 'video' | 'phone' | 'in_person' | 'task'
  scheduled_at    TIMESTAMPTZ,
  duration_mins   INTEGER,
  location_or_link TEXT,                         -- room / Zoom link
  interviewers    TEXT[],                        -- names of interviewers
  status          TEXT NOT NULL DEFAULT 'scheduled',
  -- 'scheduled' | 'completed' | 'cancelled' | 'rescheduled' | 'no_show'

  outcome         TEXT,                          -- 'pass' | 'fail' | 'hold' | 'pending'
  feedback_notes  TEXT,                          -- internal recruiter notes
  client_feedback TEXT,                          -- client's feedback on the candidate
  created_by      UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_interviews_requisition ON interview_schedules(requisition_id);
CREATE INDEX IF NOT EXISTS idx_interviews_candidate   ON interview_schedules(candidate_id);
CREATE INDEX IF NOT EXISTS idx_interviews_company     ON interview_schedules(company_id);

CREATE TRIGGER interview_schedules_updated_at
  BEFORE UPDATE ON interview_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── RLS ───────────────────────────────────────────────────────

ALTER TABLE offers               ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_schedules  ENABLE ROW LEVEL SECURITY;

-- Offers: clients see their own; admin sees all
CREATE POLICY "client_offers_select" ON offers FOR SELECT
  USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "tps_offers" ON offers FOR ALL
  USING (is_tps_staff());

-- Interview schedules: clients see their own; admin sees all
CREATE POLICY "client_interviews_select" ON interview_schedules FOR SELECT
  USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "tps_interviews" ON interview_schedules FOR ALL
  USING (is_tps_staff());
