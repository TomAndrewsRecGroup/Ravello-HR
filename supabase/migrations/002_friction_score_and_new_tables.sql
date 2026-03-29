-- ══════════════════════════════════════════════════════════════
--  Migration 002: Friction Score + New Tables
--  The People Office — Phase 2 build
-- ══════════════════════════════════════════════════════════════

-- ── Friction Score columns on requisitions ────────────────────
-- Adds pre-launch Friction Lens scoring to every role

ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS salary_min            INTEGER,
  ADD COLUMN IF NOT EXISTS salary_max            INTEGER,
  ADD COLUMN IF NOT EXISTS working_model         TEXT,     -- 'office' | 'hybrid' | 'remote'
  ADD COLUMN IF NOT EXISTS interview_stages      INTEGER,
  ADD COLUMN IF NOT EXISTS nice_to_haves         TEXT[],
  ADD COLUMN IF NOT EXISTS reason_for_hire       TEXT,     -- 'new_headcount' | 'replacement' | 'expansion'
  ADD COLUMN IF NOT EXISTS urgency               TEXT,     -- 'asap' | 'within_1_month' | 'within_3_months'
  ADD COLUMN IF NOT EXISTS reporting_line        TEXT,
  ADD COLUMN IF NOT EXISTS friction_score        JSONB,    -- full five-dimension result object
  ADD COLUMN IF NOT EXISTS friction_level        TEXT,     -- 'Low' | 'Medium' | 'High' | 'Critical' | 'Unknown'
  ADD COLUMN IF NOT EXISTS friction_recommendations JSONB, -- array of recommendation strings
  ADD COLUMN IF NOT EXISTS friction_scored_at    TIMESTAMPTZ;

-- ── Client Services ───────────────────────────────────────────
-- Which packages each client is currently on

CREATE TABLE IF NOT EXISTS client_services (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  service_name TEXT NOT NULL,           -- e.g. 'HIRE', 'LEAD', 'PROTECT', 'DealReady People'
  service_tier TEXT NOT NULL,           -- e.g. 'Foundations', 'Optimiser', 'Embedded', 'Partner'
  start_date   DATE NOT NULL,
  end_date     DATE,                    -- NULL = ongoing
  status       TEXT NOT NULL DEFAULT 'active', -- 'active' | 'paused' | 'completed'
  monthly_fee  INTEGER,                 -- pence
  notes        TEXT
);

CREATE INDEX IF NOT EXISTS idx_client_services_company ON client_services(company_id);
CREATE TRIGGER client_services_updated_at
  BEFORE UPDATE ON client_services
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Actions ──────────────────────────────────────────────────
-- System-generated and manual action items per client

CREATE TABLE IF NOT EXISTS actions (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action_type          TEXT NOT NULL, -- 'draft_role' | 'ageing_role' | 'pending_document' | 'no_services' | 'manual'
  title                TEXT NOT NULL,
  description          TEXT,
  related_entity_id    UUID,
  related_entity_type  TEXT, -- 'requisition' | 'document' | 'company'
  priority             TEXT NOT NULL DEFAULT 'medium', -- 'high' | 'medium' | 'low'
  status               TEXT NOT NULL DEFAULT 'active', -- 'active' | 'dismissed' | 'complete'
  dismissed_at         TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  dismiss_until        TIMESTAMPTZ -- snooze — don't show until this time
);

CREATE INDEX IF NOT EXISTS idx_actions_company ON actions(company_id);
CREATE INDEX IF NOT EXISTS idx_actions_status  ON actions(status);
CREATE TRIGGER actions_updated_at
  BEFORE UPDATE ON actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Milestones (People Roadmap) ───────────────────────────────

CREATE TABLE IF NOT EXISTS milestones (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pillar      TEXT NOT NULL,  -- 'hire' | 'lead' | 'protect'
  title       TEXT NOT NULL,
  description TEXT,
  owner       TEXT,           -- 'Lucy' | 'Tom'
  due_date    DATE,
  status      TEXT NOT NULL DEFAULT 'not_started', -- 'not_started' | 'in_progress' | 'complete' | 'at_risk'
  quarter     TEXT NOT NULL,  -- e.g. 'Q2-2026'
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_milestones_company ON milestones(company_id);
CREATE INDEX IF NOT EXISTS idx_milestones_quarter ON milestones(quarter);
CREATE TRIGGER milestones_updated_at
  BEFORE UPDATE ON milestones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Service Requests ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS service_requests (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  submitted_by   UUID NOT NULL REFERENCES auth.users(id),
  request_type   TEXT NOT NULL, -- 'policy_update' | 'salary_benchmark' | 'manager_support' | 'strategic_review' | 'hr_audit'
  subject        TEXT NOT NULL,
  details        JSONB NOT NULL DEFAULT '{}', -- request-type-specific fields
  urgency        TEXT,
  status         TEXT NOT NULL DEFAULT 'new', -- 'new' | 'in_progress' | 'complete'
  response_notes TEXT,
  responded_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_service_requests_company ON service_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_status  ON service_requests(status);
CREATE TRIGGER service_requests_updated_at
  BEFORE UPDATE ON service_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Onboarding Progress ───────────────────────────────────────
-- Tracks per-user first-login onboarding completion

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS onboarding_step        INTEGER NOT NULL DEFAULT 0;

-- ── Document extras ───────────────────────────────────────────
-- Adds category expansion + approval workflow

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS status           TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'archived'
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS approved_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by      UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS file_path        TEXT,  -- Supabase Storage path
  ADD COLUMN IF NOT EXISTS parent_id        UUID REFERENCES documents(id);   -- for versioning

-- ══════════════════════════════════════════════════════════════
--  Row Level Security for new tables
-- ══════════════════════════════════════════════════════════════

ALTER TABLE client_services  ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions          ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones       ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;

-- Client Services
CREATE POLICY "client_services_select" ON client_services FOR SELECT
  USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "tps_client_services" ON client_services FOR ALL
  USING (is_tps_staff());

-- Actions
CREATE POLICY "client_actions_select" ON actions FOR SELECT
  USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "client_actions_update" ON actions FOR UPDATE
  USING (company_id = my_company_id());
CREATE POLICY "tps_actions" ON actions FOR ALL
  USING (is_tps_staff());

-- Milestones
CREATE POLICY "client_milestones_select" ON milestones FOR SELECT
  USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "tps_milestones" ON milestones FOR ALL
  USING (is_tps_staff());

-- Service Requests
CREATE POLICY "client_service_requests_select" ON service_requests FOR SELECT
  USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "client_service_requests_insert" ON service_requests FOR INSERT
  WITH CHECK (company_id = my_company_id());
CREATE POLICY "tps_service_requests" ON service_requests FOR ALL
  USING (is_tps_staff());
