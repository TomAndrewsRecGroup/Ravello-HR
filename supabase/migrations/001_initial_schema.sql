-- ══════════════════════════════════════════════════════════════
--  TPS — Initial Database Schema
--  Run this in Supabase SQL Editor to set up the full schema.
-- ══════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Enums ────────────────────────────────────────────────────
CREATE TYPE user_role      AS ENUM ('client_admin','client_user','tps_admin','tps_recruiter');
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

-- Helper: is TPS staff?
CREATE OR REPLACE FUNCTION is_tps_staff()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'));
$$;

-- Companies: clients see only their company; TPS sees all
CREATE POLICY "client_companies"     ON companies FOR SELECT USING (id = my_company_id() OR is_tps_staff());
CREATE POLICY "tps_manage_companies" ON companies FOR ALL    USING (is_tps_staff());

-- Profiles: users see their own + company members; TPS sees all
CREATE POLICY "own_profile"          ON profiles FOR SELECT USING (id = auth.uid() OR company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "update_own_profile"   ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "tps_profiles"     ON profiles FOR ALL    USING (is_tps_staff());

-- Requisitions: company-scoped or TPS
CREATE POLICY "client_requisitions"  ON requisitions FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "client_insert_req"    ON requisitions FOR INSERT WITH CHECK (company_id = my_company_id());
CREATE POLICY "tps_requisitions" ON requisitions FOR ALL    USING (is_tps_staff());

-- Candidates: company-scoped + approved_for_client filter (enforced in app) or TPS
CREATE POLICY "client_candidates"    ON candidates FOR SELECT USING (company_id = my_company_id() AND approved_for_client = TRUE OR is_tps_staff());
CREATE POLICY "client_update_cand"   ON candidates FOR UPDATE USING (company_id = my_company_id());
CREATE POLICY "tps_candidates"   ON candidates FOR ALL    USING (is_tps_staff());

-- Documents: company-scoped
CREATE POLICY "client_documents"     ON documents FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "tps_documents"    ON documents FOR ALL    USING (is_tps_staff());

-- Tickets: company-scoped
CREATE POLICY "client_tickets"       ON tickets FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "client_insert_ticket" ON tickets FOR INSERT WITH CHECK (company_id = my_company_id());
CREATE POLICY "client_update_ticket" ON tickets FOR UPDATE USING (company_id = my_company_id() AND status NOT IN ('resolved','closed'));
CREATE POLICY "tps_tickets"      ON tickets FOR ALL    USING (is_tps_staff());

-- Ticket messages: visible to company or TPS (no internal notes to clients)
CREATE POLICY "client_messages"      ON ticket_messages FOR SELECT USING (
  is_internal = FALSE AND
  EXISTS(SELECT 1 FROM tickets t WHERE t.id = ticket_id AND t.company_id = my_company_id())
  OR is_tps_staff()
);
CREATE POLICY "client_insert_msg"    ON ticket_messages FOR INSERT WITH CHECK (
  EXISTS(SELECT 1 FROM tickets t WHERE t.id = ticket_id AND t.company_id = my_company_id())
);
CREATE POLICY "tps_messages"     ON ticket_messages FOR ALL USING (is_tps_staff());

-- Reports: company-scoped
CREATE POLICY "client_reports"       ON reports FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "tps_reports"      ON reports FOR ALL USING (is_tps_staff());

-- Compliance items: company-scoped
CREATE POLICY "client_compliance"    ON compliance_items FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "tps_compliance"   ON compliance_items FOR ALL USING (is_tps_staff());

-- ══════════════════════════════════════════════════════════════
--  Storage bucket
-- ══════════════════════════════════════════════════════════════
-- Run in Supabase dashboard > Storage > New bucket: "documents"
-- Set to private, then add policy:
-- Allow authenticated users to upload to their own company folder.
-- (Configure via dashboard or use supabase-js Storage API in app)
