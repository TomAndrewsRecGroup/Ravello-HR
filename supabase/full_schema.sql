-- ══════════════════════════════════════════════════════════════
--  Ravello — Initial Database Schema
--  Run this in Supabase SQL Editor to set up the full schema.
-- ══════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Enums ────────────────────────────────────────────────────
CREATE TYPE user_role      AS ENUM ('client_admin','client_user','ravello_admin','ravello_staff');
CREATE TYPE hiring_stage   AS ENUM ('submitted','in_progress','shortlist_ready','interview','offer','filled','cancelled');
CREATE TYPE ticket_status  AS ENUM ('open','in_progress','resolved','closed');
CREATE TYPE ticket_priority AS ENUM ('low','normal','high','urgent');
CREATE TYPE doc_category   AS ENUM ('contract','policy','letter','report','other');
CREATE TYPE compliance_status AS ENUM ('pending','in_review','complete','overdue');
CREATE TYPE candidate_client_status AS ENUM ('pending','approved','rejected','info_requested');

-- ── Companies ────────────────────────────────────────────────
CREATE TABLE companies (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name          TEXT NOT NULL,
  slug          TEXT NOT NULL UNIQUE,
  size_band     TEXT,
  sector        TEXT,
  contact_email TEXT,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  feature_flags JSONB NOT NULL DEFAULT '{"hiring":true,"documents":true,"reports":false,"support":true,"metrics":false,"compliance":false}'
);

-- ── Profiles (extends auth.users) ────────────────────────────
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id  UUID REFERENCES companies(id) ON DELETE SET NULL,
  email       TEXT NOT NULL,
  full_name   TEXT,
  role        user_role NOT NULL DEFAULT 'client_user',
  avatar_url  TEXT
);

-- Auto-create profile on sign up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ── Requisitions ─────────────────────────────────────────────
CREATE TABLE requisitions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  department       TEXT,
  seniority        TEXT,
  salary_range     TEXT,
  location         TEXT,
  employment_type  TEXT,
  description      TEXT,
  must_haves       TEXT[],
  stage            hiring_stage NOT NULL DEFAULT 'submitted',
  submitted_by     UUID NOT NULL REFERENCES auth.users(id),
  assigned_recruiter TEXT
);
CREATE INDEX idx_requisitions_company ON requisitions(company_id);
CREATE INDEX idx_requisitions_stage   ON requisitions(stage);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
CREATE TRIGGER requisitions_updated_at
  BEFORE UPDATE ON requisitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Candidates ───────────────────────────────────────────────
CREATE TABLE candidates (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requisition_id      UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  full_name           TEXT NOT NULL,
  email               TEXT,
  phone               TEXT,
  summary             TEXT,
  cv_url              TEXT,
  recruiter_notes     TEXT,
  approved_for_client BOOLEAN NOT NULL DEFAULT FALSE,
  client_status       candidate_client_status NOT NULL DEFAULT 'pending',
  client_feedback     TEXT
);
CREATE INDEX idx_candidates_req ON candidates(requisition_id);

-- ── Documents ────────────────────────────────────────────────
CREATE TABLE documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  category      doc_category NOT NULL DEFAULT 'other',
  file_url      TEXT NOT NULL,
  file_size     BIGINT,
  version       INTEGER NOT NULL DEFAULT 1,
  uploaded_by   UUID NOT NULL REFERENCES auth.users(id),
  review_due_at TIMESTAMPTZ,
  notes         TEXT
);
CREATE INDEX idx_documents_company ON documents(company_id);
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Tickets ──────────────────────────────────────────────────
CREATE TABLE tickets (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  submitted_by UUID NOT NULL REFERENCES auth.users(id),
  subject      TEXT NOT NULL,
  description  TEXT NOT NULL,
  status       ticket_status NOT NULL DEFAULT 'open',
  priority     ticket_priority NOT NULL DEFAULT 'normal',
  assigned_to  UUID REFERENCES auth.users(id),
  resolved_at  TIMESTAMPTZ
);
CREATE INDEX idx_tickets_company ON tickets(company_id);
CREATE INDEX idx_tickets_status  ON tickets(status);
CREATE TRIGGER tickets_updated_at
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Ticket Messages ──────────────────────────────────────────
CREATE TABLE ticket_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES auth.users(id),
  body        TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_ticket_messages_ticket ON ticket_messages(ticket_id);

-- ── Reports ──────────────────────────────────────────────────
CREATE TABLE reports (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  period       TEXT,
  file_url     TEXT NOT NULL,
  generated_by UUID NOT NULL REFERENCES auth.users(id)
);
CREATE INDEX idx_reports_company ON reports(company_id);

-- ── Compliance Items ─────────────────────────────────────────
CREATE TABLE compliance_items (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT,
  due_date    DATE NOT NULL,
  status      compliance_status NOT NULL DEFAULT 'pending',
  category    TEXT NOT NULL DEFAULT 'general',
  assigned_to UUID REFERENCES auth.users(id)
);
CREATE INDEX idx_compliance_company ON compliance_items(company_id);
CREATE INDEX idx_compliance_due     ON compliance_items(due_date);

-- ══════════════════════════════════════════════════════════════
--  Row Level Security
-- ══════════════════════════════════════════════════════════════

ALTER TABLE companies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisitions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports         ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_items ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's company_id
CREATE OR REPLACE FUNCTION my_company_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$;

-- Helper: is Ravello staff?
CREATE OR REPLACE FUNCTION is_ravello_staff()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_staff'));
$$;

-- Companies: clients see only their company; Ravello sees all
CREATE POLICY "client_companies"     ON companies FOR SELECT USING (id = my_company_id() OR is_ravello_staff());
CREATE POLICY "ravello_manage_companies" ON companies FOR ALL    USING (is_ravello_staff());

-- Profiles: users see their own + company members; Ravello sees all
CREATE POLICY "own_profile"          ON profiles FOR SELECT USING (id = auth.uid() OR company_id = my_company_id() OR is_ravello_staff());
CREATE POLICY "update_own_profile"   ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "ravello_profiles"     ON profiles FOR ALL    USING (is_ravello_staff());

-- Requisitions: company-scoped or Ravello
CREATE POLICY "client_requisitions"  ON requisitions FOR SELECT USING (company_id = my_company_id() OR is_ravello_staff());
CREATE POLICY "client_insert_req"    ON requisitions FOR INSERT WITH CHECK (company_id = my_company_id());
CREATE POLICY "ravello_requisitions" ON requisitions FOR ALL    USING (is_ravello_staff());

-- Candidates: company-scoped + approved_for_client filter (enforced in app) or Ravello
CREATE POLICY "client_candidates"    ON candidates FOR SELECT USING (company_id = my_company_id() AND approved_for_client = TRUE OR is_ravello_staff());
CREATE POLICY "client_update_cand"   ON candidates FOR UPDATE USING (company_id = my_company_id());
CREATE POLICY "ravello_candidates"   ON candidates FOR ALL    USING (is_ravello_staff());

-- Documents: company-scoped
CREATE POLICY "client_documents"     ON documents FOR SELECT USING (company_id = my_company_id() OR is_ravello_staff());
CREATE POLICY "ravello_documents"    ON documents FOR ALL    USING (is_ravello_staff());

-- Tickets: company-scoped
CREATE POLICY "client_tickets"       ON tickets FOR SELECT USING (company_id = my_company_id() OR is_ravello_staff());
CREATE POLICY "client_insert_ticket" ON tickets FOR INSERT WITH CHECK (company_id = my_company_id());
CREATE POLICY "client_update_ticket" ON tickets FOR UPDATE USING (company_id = my_company_id() AND status NOT IN ('resolved','closed'));
CREATE POLICY "ravello_tickets"      ON tickets FOR ALL    USING (is_ravello_staff());

-- Ticket messages: visible to company or Ravello (no internal notes to clients)
CREATE POLICY "client_messages"      ON ticket_messages FOR SELECT USING (
  is_internal = FALSE AND
  EXISTS(SELECT 1 FROM tickets t WHERE t.id = ticket_id AND t.company_id = my_company_id())
  OR is_ravello_staff()
);
CREATE POLICY "client_insert_msg"    ON ticket_messages FOR INSERT WITH CHECK (
  EXISTS(SELECT 1 FROM tickets t WHERE t.id = ticket_id AND t.company_id = my_company_id())
);
CREATE POLICY "ravello_messages"     ON ticket_messages FOR ALL USING (is_ravello_staff());

-- Reports: company-scoped
CREATE POLICY "client_reports"       ON reports FOR SELECT USING (company_id = my_company_id() OR is_ravello_staff());
CREATE POLICY "ravello_reports"      ON reports FOR ALL USING (is_ravello_staff());

-- Compliance items: company-scoped
CREATE POLICY "client_compliance"    ON compliance_items FOR SELECT USING (company_id = my_company_id() OR is_ravello_staff());
CREATE POLICY "ravello_compliance"   ON compliance_items FOR ALL USING (is_ravello_staff());

-- ══════════════════════════════════════════════════════════════
--  Storage bucket
-- ══════════════════════════════════════════════════════════════
-- Run in Supabase dashboard > Storage > New bucket: "documents"
-- Set to private, then add policy:
-- Allow authenticated users to upload to their own company folder.
-- (Configure via dashboard or use supabase-js Storage API in app)
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
  USING (company_id = my_company_id() OR is_ravello_staff());
CREATE POLICY "ravello_client_services" ON client_services FOR ALL
  USING (is_ravello_staff());

-- Actions
CREATE POLICY "client_actions_select" ON actions FOR SELECT
  USING (company_id = my_company_id() OR is_ravello_staff());
CREATE POLICY "client_actions_update" ON actions FOR UPDATE
  USING (company_id = my_company_id());
CREATE POLICY "ravello_actions" ON actions FOR ALL
  USING (is_ravello_staff());

-- Milestones
CREATE POLICY "client_milestones_select" ON milestones FOR SELECT
  USING (company_id = my_company_id() OR is_ravello_staff());
CREATE POLICY "ravello_milestones" ON milestones FOR ALL
  USING (is_ravello_staff());

-- Service Requests
CREATE POLICY "client_service_requests_select" ON service_requests FOR SELECT
  USING (company_id = my_company_id() OR is_ravello_staff());
CREATE POLICY "client_service_requests_insert" ON service_requests FOR INSERT
  WITH CHECK (company_id = my_company_id());
CREATE POLICY "ravello_service_requests" ON service_requests FOR ALL
  USING (is_ravello_staff());
-- ══════════════════════════════════════════════════════════════
--  Migration 003: BD Intelligence Tables
--  Populated by the IvyLens browser extension
-- ══════════════════════════════════════════════════════════════

-- ── BD Companies ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bd_companies (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name            TEXT NOT NULL,
  company_name_normalised TEXT NOT NULL,  -- lowercase, trimmed, Ltd/PLC stripped
  first_seen_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_roles_seen        INTEGER NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'prospect', -- 'prospect' | 'contacted' | 'client' | 'not_relevant'
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_bd_companies_normalised ON bd_companies(company_name_normalised);
CREATE INDEX IF NOT EXISTS idx_bd_companies_status   ON bd_companies(status);
CREATE INDEX IF NOT EXISTS idx_bd_companies_last_seen ON bd_companies(last_seen_at DESC);

CREATE OR REPLACE FUNCTION bd_companies_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;
CREATE TRIGGER bd_companies_updated_at
  BEFORE UPDATE ON bd_companies
  FOR EACH ROW EXECUTE FUNCTION bd_companies_updated_at();

-- ── BD Scanned Roles ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS bd_scanned_roles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES bd_companies(id) ON DELETE CASCADE,
  role_title    TEXT NOT NULL,
  salary_min    INTEGER,
  salary_max    INTEGER,
  salary_text   TEXT,    -- raw salary string as scraped
  location      TEXT,
  working_model TEXT,    -- 'remote' | 'hybrid' | 'on-site' | null
  skills        TEXT[],  -- array of skill/requirement strings
  source_url    TEXT NOT NULL,
  source_board  TEXT,    -- 'linkedin' | 'indeed' | 'reed' | 'totaljobs' | 'cv-library' | 'other'
  date_posted   TEXT,    -- raw date string from job board
  scanned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  still_active  BOOLEAN NOT NULL DEFAULT TRUE,
  raw_data      JSONB    -- full scraped payload for reference
);

CREATE INDEX IF NOT EXISTS idx_bd_scanned_roles_company    ON bd_scanned_roles(company_id);
CREATE INDEX IF NOT EXISTS idx_bd_scanned_roles_scanned_at ON bd_scanned_roles(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_bd_scanned_roles_active     ON bd_scanned_roles(still_active);

-- ══════════════════════════════════════════════════════════════
--  RLS for BD tables (admin-only)
-- ══════════════════════════════════════════════════════════════

ALTER TABLE bd_companies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE bd_scanned_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ravello_bd_companies"     ON bd_companies     FOR ALL USING (is_ravello_staff());
CREATE POLICY "ravello_bd_scanned_roles" ON bd_scanned_roles FOR ALL USING (is_ravello_staff());

-- Extension can INSERT via service role key (configured in extension)
-- No client-facing access needed for BD intelligence tables
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
  USING (company_id = my_company_id() OR is_ravello_staff());
CREATE POLICY "ravello_offers" ON offers FOR ALL
  USING (is_ravello_staff());

-- Interview schedules: clients see their own; admin sees all
CREATE POLICY "client_interviews_select" ON interview_schedules FOR SELECT
  USING (company_id = my_company_id() OR is_ravello_staff());
CREATE POLICY "ravello_interviews" ON interview_schedules FOR ALL
  USING (is_ravello_staff());
-- ============================================================
-- Migration 005: LEAD + PROTECT tables
-- Training needs, performance reviews, skills matrix,
-- employee documents, HR dashboard data
-- ============================================================

-- ── LEAD: Training needs log ─────────────────────────────────
CREATE TABLE IF NOT EXISTS training_needs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  flagged_by    UUID REFERENCES profiles(id),
  employee_name TEXT,
  department    TEXT,
  skill_gap     TEXT NOT NULL,
  priority      TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','deferred')),
  notes         TEXT,
  target_date   DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── LEAD: Performance reviews ────────────────────────────────
CREATE TABLE IF NOT EXISTS performance_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_name   TEXT NOT NULL,
  employee_email  TEXT,
  department      TEXT,
  review_period   TEXT NOT NULL,  -- e.g. "Q1 2026", "Annual 2025"
  review_type     TEXT NOT NULL DEFAULT 'annual' CHECK (review_type IN ('annual','mid_year','probation','360','other')),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
  overall_rating  TEXT,           -- e.g. "Exceeds", "Meets", "Below"
  reviewer_name   TEXT,
  due_date        DATE,
  completed_at    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── LEAD: Skills matrix ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS skills_matrix (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_name   TEXT NOT NULL,
  department      TEXT,
  role_title      TEXT,
  skill_name      TEXT NOT NULL,
  skill_category  TEXT,           -- e.g. "Technical", "Leadership", "Communication"
  current_level   INTEGER CHECK (current_level BETWEEN 0 AND 5),  -- 0=none, 5=expert
  target_level    INTEGER CHECK (target_level BETWEEN 0 AND 5),
  last_assessed   DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PROTECT: Employee documents ──────────────────────────────
CREATE TABLE IF NOT EXISTS employee_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_name   TEXT NOT NULL,
  employee_email  TEXT,
  department      TEXT,
  doc_type        TEXT NOT NULL CHECK (doc_type IN (
    'contract','right_to_work','dbs_check','visa','offer_letter',
    'nda','disciplinary','grievance','absence_record','other'
  )),
  title           TEXT NOT NULL,
  file_url        TEXT,
  expiry_date     DATE,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','pending_renewal','archived')),
  notes           TEXT,
  uploaded_by     UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PROTECT: Absence records ─────────────────────────────────
CREATE TABLE IF NOT EXISTS absence_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_name   TEXT NOT NULL,
  employee_email  TEXT,
  department      TEXT,
  absence_type    TEXT NOT NULL CHECK (absence_type IN (
    'holiday','sick','maternity','paternity','shared_parental',
    'compassionate','unpaid','other'
  )),
  start_date      DATE NOT NULL,
  end_date        DATE,
  days            NUMERIC(5,1),
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  notes           TEXT,
  approved_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── PROTECT: HR dashboard headcount/diversity data ───────────
CREATE TABLE IF NOT EXISTS hr_metrics (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period          TEXT NOT NULL,  -- e.g. "2026-Q1"
  headcount       INTEGER,
  headcount_target INTEGER,
  turnover_rate   NUMERIC(5,2),   -- percentage
  absence_rate    NUMERIC(5,2),   -- percentage
  gender_m_pct    NUMERIC(5,2),
  gender_f_pct    NUMERIC(5,2),
  gender_other_pct NUMERIC(5,2),
  avg_tenure_months INTEGER,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, period)
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_training_needs_company ON training_needs(company_id);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_company   ON performance_reviews(company_id);
CREATE INDEX IF NOT EXISTS idx_skills_matrix_company  ON skills_matrix(company_id);
CREATE INDEX IF NOT EXISTS idx_emp_docs_company       ON employee_documents(company_id);
CREATE INDEX IF NOT EXISTS idx_absence_company        ON absence_records(company_id);
CREATE INDEX IF NOT EXISTS idx_hr_metrics_company     ON hr_metrics(company_id);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE training_needs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills_matrix       ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_documents  ENABLE ROW LEVEL SECURITY;
ALTER TABLE absence_records     ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_metrics          ENABLE ROW LEVEL SECURITY;

-- Clients see their own data
CREATE POLICY "client_training_needs" ON training_needs
  FOR ALL USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "client_perf_reviews" ON performance_reviews
  FOR ALL USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "client_skills_matrix" ON skills_matrix
  FOR ALL USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "client_emp_docs" ON employee_documents
  FOR ALL USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "client_absence" ON absence_records
  FOR ALL USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "client_hr_metrics" ON hr_metrics
  FOR ALL USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Admin full access
CREATE POLICY "admin_training_needs" ON training_needs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_staff'))
  );

CREATE POLICY "admin_perf_reviews" ON performance_reviews
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_staff'))
  );

CREATE POLICY "admin_skills_matrix" ON skills_matrix
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_staff'))
  );

CREATE POLICY "admin_emp_docs" ON employee_documents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_staff'))
  );

CREATE POLICY "admin_absence" ON absence_records
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_staff'))
  );

CREATE POLICY "admin_hr_metrics" ON hr_metrics
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_staff'))
  );
-- ============================================================
-- Migration 006: E-learning marketplace
-- learning_content, learning_purchases tables
-- ============================================================

-- ── Learning content (admin-managed) ─────────────────────────
CREATE TABLE IF NOT EXISTS learning_content (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  description     TEXT,
  creator_name    TEXT,
  category        TEXT,                -- e.g. "HR Fundamentals", "Leadership", "Compliance"
  tags            TEXT[],
  content_type    TEXT NOT NULL DEFAULT 'video' CHECK (content_type IN ('video','pdf','pptx','link','scorm')),
  file_url        TEXT,                -- Vercel Blob or Supabase Storage URL
  thumbnail_url   TEXT,
  duration_mins   INTEGER,             -- estimated duration
  price_pence     INTEGER NOT NULL DEFAULT 0,  -- 0 = free
  stripe_price_id TEXT,                -- Stripe Price ID for paid content
  is_published    BOOLEAN NOT NULL DEFAULT false,
  is_featured     BOOLEAN NOT NULL DEFAULT false,
  view_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Learning purchases ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learning_purchases (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id          UUID NOT NULL REFERENCES learning_content(id) ON DELETE CASCADE,
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  purchased_by        UUID REFERENCES profiles(id),
  stripe_session_id   TEXT,
  stripe_payment_intent TEXT,
  amount_pence        INTEGER NOT NULL DEFAULT 0,
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','expired','refunded')),
  access_expires_at   TIMESTAMPTZ,     -- 7 days from purchase
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_learning_content_published ON learning_content(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_learning_content_category  ON learning_content(category);
CREATE INDEX IF NOT EXISTS idx_learning_purchases_company ON learning_purchases(company_id);
CREATE INDEX IF NOT EXISTS idx_learning_purchases_content ON learning_purchases(content_id);
CREATE INDEX IF NOT EXISTS idx_learning_purchases_status  ON learning_purchases(status);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE learning_content   ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_purchases ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read published content
CREATE POLICY "read_published_content" ON learning_content
  FOR SELECT USING (is_published = true AND auth.uid() IS NOT NULL);

-- Admin can do everything
CREATE POLICY "admin_learning_content" ON learning_content
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_staff'))
  );

-- Clients can read their own purchases
CREATE POLICY "client_purchases_read" ON learning_purchases
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Clients can insert purchases (Stripe webhook will also insert via service role)
CREATE POLICY "client_purchases_insert" ON learning_purchases
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

-- Admin full access to purchases
CREATE POLICY "admin_purchases" ON learning_purchases
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_staff'))
  );
-- ══════════════════════════════════════════════════════════════
--  Migration 007: Add jd_text to requisitions
--  Stores the raw job description text submitted via the
--  IvyLens / Friction Lens form on the new requisition page.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE requisitions
  ADD COLUMN IF NOT EXISTS jd_text TEXT;
-- ══════════════════════════════════════════════════════════════
--  Migration 008: Salary Benchmarks
--  Market salary ranges by role type, location, seniority.
--  Admin-managed; clients view comparison against their roles.
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS salary_benchmarks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_type       TEXT NOT NULL,          -- e.g. "Software Engineer", "HR Manager"
  location        TEXT,                   -- e.g. "London", "Manchester", "Remote"
  seniority       TEXT,                   -- e.g. "Junior", "Mid", "Senior", "Lead", "Director"
  working_model   TEXT,                   -- 'office' | 'hybrid' | 'remote' | NULL = all
  salary_p25      INTEGER,                -- 25th percentile (pence or annual £)
  salary_p50      INTEGER,                -- median (pence or annual £)
  salary_p75      INTEGER,                -- 75th percentile
  salary_p90      INTEGER,                -- 90th percentile (top earner benchmark)
  currency        TEXT NOT NULL DEFAULT 'GBP',
  source          TEXT,                   -- e.g. "Reed 2025 Salary Guide", "Internal Data"
  effective_date  DATE,                   -- when benchmark data was collected
  notes           TEXT,
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_salary_benchmarks_role     ON salary_benchmarks(role_type);
CREATE INDEX IF NOT EXISTS idx_salary_benchmarks_location ON salary_benchmarks(location);

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE salary_benchmarks ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read benchmarks
CREATE POLICY "read_benchmarks" ON salary_benchmarks
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- Only admin can write
CREATE POLICY "admin_benchmarks" ON salary_benchmarks
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin', 'ravello_recruiter'))
  );
-- ══════════════════════════════════════════════════════════════
--  Migration 009: Manatal ATS Integration
--  Add manatal_client_id to companies for linking to Manatal.
--  Admin sets this when converting/creating a client.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS manatal_client_id TEXT;  -- Manatal department/client ID

COMMENT ON COLUMN companies.manatal_client_id IS
  'Manatal ATS department or client ID. When set, the portal HIRE section can display live pipeline data from Manatal.';
-- ══════════════════════════════════════════════════════════════
--  Migration 010: RLS Audit Fixes
--  Fix is_ravello_staff() to include ravello_recruiter.
--  The enum is: ravello_admin | ravello_recruiter (NOT ravello_staff).
--  Several policies also use 'ravello_staff' inline — patched below.
-- ══════════════════════════════════════════════════════════════

-- ── Fix is_ravello_staff() helper ────────────────────────────
CREATE OR REPLACE FUNCTION is_ravello_staff()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role IN ('ravello_admin', 'ravello_recruiter')
  );
$$;

-- ── Fix LEAD / PROTECT admin policies ────────────────────────
-- These were incorrectly using 'ravello_staff' instead of 'ravello_recruiter'

DROP POLICY IF EXISTS "admin_training_needs"    ON training_needs;
DROP POLICY IF EXISTS "admin_perf_reviews"      ON performance_reviews;
DROP POLICY IF EXISTS "admin_skills_matrix"     ON skills_matrix;
DROP POLICY IF EXISTS "admin_emp_docs"          ON employee_documents;
DROP POLICY IF EXISTS "admin_absence"           ON absence_records;
DROP POLICY IF EXISTS "admin_hr_metrics"        ON hr_metrics;

CREATE POLICY "admin_training_needs" ON training_needs
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_recruiter'))
  );

CREATE POLICY "admin_perf_reviews" ON performance_reviews
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_recruiter'))
  );

CREATE POLICY "admin_skills_matrix" ON skills_matrix
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_recruiter'))
  );

CREATE POLICY "admin_emp_docs" ON employee_documents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_recruiter'))
  );

CREATE POLICY "admin_absence" ON absence_records
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_recruiter'))
  );

CREATE POLICY "admin_hr_metrics" ON hr_metrics
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_recruiter'))
  );

-- ── Fix learning_content admin policy ────────────────────────
DROP POLICY IF EXISTS "admin_learning_content" ON learning_content;

CREATE POLICY "admin_learning_content" ON learning_content
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_recruiter'))
  );

-- ── Fix learning_purchases admin policy ──────────────────────
DROP POLICY IF EXISTS "admin_purchases" ON learning_purchases;

CREATE POLICY "admin_purchases" ON learning_purchases
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_recruiter'))
  );

-- ── client_insert_req: clients can insert requisitions ───────
-- Ensure client_admin + client_user can insert (not just any my_company_id)
DROP POLICY IF EXISTS "client_insert_req" ON requisitions;

CREATE POLICY "client_insert_req" ON requisitions
  FOR INSERT WITH CHECK (
    company_id = my_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('client_admin', 'client_user', 'ravello_admin', 'ravello_recruiter')
    )
  );

-- ── client_viewers should not insert tickets ─────────────────
DROP POLICY IF EXISTS "client_insert_ticket" ON tickets;

CREATE POLICY "client_insert_ticket" ON tickets
  FOR INSERT WITH CHECK (
    company_id = my_company_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('client_admin', 'client_user', 'ravello_admin', 'ravello_recruiter')
    )
  );

-- ── Notes: ───────────────────────────────────────────────────
-- company_id INSERT checks on service_requests, ticket_messages etc.
-- are fine as-is because they rely on my_company_id() which now correctly
-- maps for any authenticated user with a company_id.
--
-- ravello_admin/recruiter have full access via is_ravello_staff()
-- on all core tables (companies, profiles, requisitions, candidates,
-- documents, tickets, ticket_messages, compliance_items, reports,
-- client_services, milestones, bd_companies, bd_scanned_roles,
-- actions, service_requests, offers, interview_schedules).
--
-- salary_benchmarks policy already uses 'ravello_recruiter' — correct.
-- ══════════════════════════════════════════════════════════════
--  Migration 011: JD Templates + CV Screening
--  Phase 34 — JD template library; CV screening fields on candidates
-- ══════════════════════════════════════════════════════════════

-- ── JD Templates ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jd_templates (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title       TEXT NOT NULL,
  department  TEXT,
  seniority   TEXT,
  working_model TEXT,
  description TEXT,
  must_haves  TEXT[],
  benefits    TEXT[],
  tags        TEXT[],
  created_by  UUID REFERENCES auth.users(id)
);

CREATE TRIGGER jd_templates_updated_at
  BEFORE UPDATE ON jd_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE jd_templates ENABLE ROW LEVEL SECURITY;

-- Only ravello staff can manage templates
CREATE POLICY "ravello_jd_templates" ON jd_templates
  FOR ALL USING (is_ravello_staff());

-- ── CV Screening fields on candidates ────────────────────────

ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cv_file_path      TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cv_file_name      TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS screening_score   INTEGER CHECK (screening_score BETWEEN 1 AND 10);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS screening_notes   TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS screened_at       TIMESTAMPTZ;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS screened_by       UUID REFERENCES auth.users(id);
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source            TEXT;
-- source: 'direct' | 'linkedin' | 'referral' | 'agency' | 'job_board'
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS pipeline_stage    TEXT NOT NULL DEFAULT 'applied';
-- pipeline_stage: 'applied' | 'screening' | 'interviewing' | 'offer' | 'hired' | 'rejected'

CREATE INDEX IF NOT EXISTS idx_jd_templates_department ON jd_templates(department);
CREATE INDEX IF NOT EXISTS idx_candidates_source        ON candidates(source);
CREATE INDEX IF NOT EXISTS idx_candidates_pipeline_stage ON candidates(pipeline_stage);

-- ── Actions: broadcast tracking ──────────────────────────────
-- Adds column to track admin-originated (broadcast) action items
ALTER TABLE actions ADD COLUMN IF NOT EXISTS created_by_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE actions ADD COLUMN IF NOT EXISTS due_date DATE;
-- ─── Friction Lens Integration ─────────────────────────────────────────────
-- Phase 42: Company assessments, friction checklist items, notifications

-- ─── Company Friction Assessments ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_assessments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ivylens_company_id UUID,
  employee_count  INTEGER,
  employee_band   TEXT CHECK (employee_band IN ('micro', 'small', 'mid', 'large')),
  form_responses  JSONB NOT NULL DEFAULT '{}',
  overall_band    TEXT CHECK (overall_band IN ('Low Friction', 'Moderate Friction', 'High Friction')),
  confidence      TEXT CHECK (confidence IN ('low', 'medium', 'high')),
  dimensions      JSONB DEFAULT '[]',
  top_signals     TEXT[] DEFAULT '{}',
  summary         TEXT,
  benchmarks      JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_company_assessments_company ON company_assessments(company_id);
CREATE INDEX idx_company_assessments_created ON company_assessments(created_at DESC);

-- ─── Admin Checklist: friction items needing action ────────────────────────
CREATE TABLE IF NOT EXISTS company_friction_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  assessment_id   UUID REFERENCES company_assessments(id) ON DELETE SET NULL,
  dimension       TEXT NOT NULL,
  field_key       TEXT NOT NULL,
  label           TEXT NOT NULL,
  severity        TEXT CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  is_completed    BOOLEAN NOT NULL DEFAULT false,
  completed_at    TIMESTAMPTZ,
  completed_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_friction_items_company ON company_friction_items(company_id);
CREATE INDEX idx_friction_items_open ON company_friction_items(company_id) WHERE is_completed = false;

-- ─── Notifications ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES profiles(id) ON DELETE CASCADE,
  company_id      UUID REFERENCES companies(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  link            TEXT,
  read            BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at DESC);

-- ─── Add friction columns to companies ─────────────────────────────────────
ALTER TABLE companies ADD COLUMN IF NOT EXISTS friction_band TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS friction_assessment_id UUID;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS ivylens_company_id UUID;

-- ─── Add approval columns to requisitions ──────────────────────────────────
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES profiles(id);
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- ─── RLS Policies ──────────────────────────────────────────────────────────

-- Company assessments: staff can see all, clients see own company
ALTER TABLE company_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage all assessments"
  ON company_assessments FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin', 'ravello_staff')));

CREATE POLICY "Clients can view own assessments"
  ON company_assessments FOR SELECT
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Clients can insert own assessments"
  ON company_assessments FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Friction items: staff only
ALTER TABLE company_friction_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage friction items"
  ON company_friction_items FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin', 'ravello_staff')));

CREATE POLICY "Clients can view own friction items"
  ON company_friction_items FOR SELECT
  USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Notifications: users see own
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own notifications"
  ON notifications FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can update own notifications"
  ON notifications FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "Authenticated users can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
-- ══════════════════════════════════════════════════════════════
--  Migration 013: Partner API Keys
--  Allows admin to create API keys for partner integrations
--  (e.g. IvyLens BD pipeline, role analysis, assessments)
-- ══════════════════════════════════════════════════════════════

-- ── Partner API Keys ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS partner_api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label        TEXT NOT NULL,                  -- human-readable name, e.g. "IvyLens Production"
  key_hash     TEXT NOT NULL,                  -- SHA-256 hash of the ivl_ prefixed key
  key_prefix   TEXT NOT NULL,                  -- first 8 chars for display, e.g. "ivl_a3f8"
  permissions  TEXT[] NOT NULL DEFAULT '{}',   -- e.g. {'bd_pipeline','role_analyze','company_lens'}
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_by   UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_partner_api_keys_hash   ON partner_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_partner_api_keys_active ON partner_api_keys(is_active);

-- RLS — admin only
ALTER TABLE partner_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ravello_partner_api_keys" ON partner_api_keys
  FOR ALL USING (is_ravello_staff());

-- ── BD Leads View ────────────────────────────────────────────
-- Materialises the leads format that partners pull via the API:
-- Each lead = { company_name, company_location, roles[], sent_at }

CREATE OR REPLACE VIEW bd_leads_view AS
SELECT
  bc.id            AS company_id,
  bc.company_name,
  bc.notes         AS company_location,
  bc.status,
  bc.last_seen_at  AS sent_at,
  COALESCE(
    json_agg(
      json_build_object(
        'role_title',    r.role_title,
        'salary_text',   r.salary_text,
        'location',      r.location,
        'working_model', r.working_model,
        'source_board',  r.source_board,
        'date_posted',   r.date_posted
      )
    ) FILTER (WHERE r.id IS NOT NULL),
    '[]'::json
  ) AS roles
FROM bd_companies bc
LEFT JOIN bd_scanned_roles r ON r.company_id = bc.id AND r.still_active = TRUE
WHERE bc.status IN ('prospect', 'contacted')
GROUP BY bc.id, bc.company_name, bc.notes, bc.status, bc.last_seen_at
ORDER BY bc.last_seen_at DESC;
