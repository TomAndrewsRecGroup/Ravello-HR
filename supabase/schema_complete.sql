-- ══════════════════════════════════════════════════════════════════════════════
--  THE PEOPLE SYSTEM — COMPLETE DATABASE SCHEMA
--  Consolidated from migrations 001–021
--  Generated: April 2026
--
--  This file represents the full current-state schema.
--  Run against a fresh Supabase project to set up everything.
--  For an existing project, run the individual migrations instead.
--
--  Tables: 47 | Enums: 13 | Functions: 5 | Triggers: 7 | Views: 1
-- ══════════════════════════════════════════════════════════════════════════════

-- ═══ EXTENSIONS ══════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══ ENUMS ═══════════════════════════════════════════════════════════════════

DO $$ BEGIN CREATE TYPE user_role AS ENUM ('client_admin','client_user','tps_admin','tps_recruiter');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE hiring_stage AS ENUM ('submitted','in_progress','shortlist_ready','interview','offer','filled','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE ticket_status AS ENUM ('open','in_progress','resolved','closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE ticket_priority AS ENUM ('low','normal','high','urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE doc_category AS ENUM ('contract','policy','letter','report','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE compliance_status AS ENUM ('pending','in_review','complete','overdue');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE candidate_client_status AS ENUM ('pending','approved','rejected','info_requested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE employment_status AS ENUM ('active','on_leave','terminated','probation');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE leave_type AS ENUM ('annual_leave','sick_day','bank_holiday','unpaid','maternity','paternity','compassionate','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE leave_status AS ENUM ('pending','approved','rejected','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE leave_year_type AS ENUM ('rolling','fixed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE calendar_event_type AS ENUM ('closed_day','bank_holiday','company_event','other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ═══ HELPER FUNCTIONS ════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE OR REPLACE FUNCTION my_company_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_tps_staff()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM profiles WHERE id = auth.uid()
      AND role IN ('tps_admin', 'tps_recruiter')
  );
$$;


-- ═══════════════════════════════════════════════════════════════════════════════
--  SECTION 1: CORE TABLES
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 1. companies ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name                 TEXT NOT NULL,
  slug                 TEXT NOT NULL UNIQUE,
  size_band            TEXT,
  sector               TEXT,
  contact_email        TEXT,
  active               BOOLEAN NOT NULL DEFAULT TRUE,
  feature_flags        JSONB NOT NULL DEFAULT '{"hiring":true,"documents":true,"reports":false,"support":true,"metrics":false,"compliance":false}'
);

-- Columns added by later migrations (safe to re-run)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS manatal_client_id    TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS friction_band        TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS friction_assessment_id UUID;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS ivylens_company_id   UUID;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS account_owner_id     UUID;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS onboarding_status    TEXT DEFAULT 'not_started';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_portal_login    TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS login_count_30d      INT DEFAULT 0;

-- ─── 2. profiles ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id                       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id               UUID REFERENCES companies(id) ON DELETE SET NULL,
  email                    TEXT NOT NULL,
  full_name                TEXT,
  role                     user_role NOT NULL DEFAULT 'client_user',
  avatar_url               TEXT
);

-- Columns added by later migrations (safe to re-run)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_completed     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS onboarding_step          INTEGER NOT NULL DEFAULT 0;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS ui_preferences           JSONB DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS privacy_consent_at       TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS privacy_consent_version  TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS marketing_consent        BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS data_processing_consent  BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS data_erasure_requested_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS data_erasure_completed_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_deactivated_at   TIMESTAMPTZ;

-- Add FK from companies.account_owner_id → profiles.id (skip if exists)
DO $$ BEGIN
  ALTER TABLE companies ADD CONSTRAINT fk_account_owner
    FOREIGN KEY (account_owner_id) REFERENCES profiles(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Auto-create profile on sign up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ─── 3. requisitions ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS requisitions (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id               UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title                    TEXT NOT NULL,
  department               TEXT,
  seniority                TEXT,
  salary_range             TEXT,
  salary_min               INTEGER,
  salary_max               INTEGER,
  location                 TEXT,
  employment_type          TEXT,
  description              TEXT,
  must_haves               TEXT[],
  nice_to_haves            TEXT[],
  stage                    hiring_stage NOT NULL DEFAULT 'submitted',
  submitted_by             UUID NOT NULL REFERENCES auth.users(id),
  assigned_recruiter       TEXT
);

-- Columns added by later migrations
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS working_model            TEXT;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS salary_min               INTEGER;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS salary_max               INTEGER;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS nice_to_haves            TEXT[];
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS interview_stages         INTEGER;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS reason_for_hire          TEXT;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS urgency                  TEXT;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS reporting_line           TEXT;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS jd_text                  TEXT;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS friction_score           JSONB;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS friction_level           TEXT;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS friction_recommendations JSONB;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS friction_scored_at       TIMESTAMPTZ;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS approved_by              UUID;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS approved_at              TIMESTAMPTZ;
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS managed_by               TEXT DEFAULT 'tpo';
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS internal_applicants      JSONB DEFAULT '[]';
CREATE INDEX IF NOT EXISTS idx_requisitions_company ON requisitions(company_id);
CREATE INDEX IF NOT EXISTS idx_requisitions_stage   ON requisitions(stage);

CREATE TRIGGER requisitions_updated_at
  BEFORE UPDATE ON requisitions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 4. candidates ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS candidates (
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

-- Columns added by later migrations
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cv_file_path      TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS cv_file_name      TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS screening_score   INTEGER;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS screening_notes   TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS screened_at       TIMESTAMPTZ;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS screened_by       UUID;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS source            TEXT;
ALTER TABLE candidates ADD COLUMN IF NOT EXISTS pipeline_stage    TEXT DEFAULT 'applied';
CREATE INDEX IF NOT EXISTS idx_candidates_req            ON candidates(requisition_id);
CREATE INDEX IF NOT EXISTS idx_candidates_source         ON candidates(source);
CREATE INDEX IF NOT EXISTS idx_candidates_pipeline_stage ON candidates(pipeline_stage);


-- ═══════════════════════════════════════════════════════════════════════════════
--  SECTION 2: DOCUMENTS, TICKETS, COMPLIANCE, REPORTS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 5. documents ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  category         doc_category NOT NULL DEFAULT 'other',
  file_url         TEXT NOT NULL,
  file_size        BIGINT,
  version          INTEGER NOT NULL DEFAULT 1,
  uploaded_by      UUID NOT NULL REFERENCES auth.users(id),
  review_due_at    TIMESTAMPTZ,
  notes            TEXT
);

-- Columns added by later migrations
ALTER TABLE documents ADD COLUMN IF NOT EXISTS status           TEXT DEFAULT 'active';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN DEFAULT FALSE;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS approved_at      TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS approved_by      UUID;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_path        TEXT;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS parent_id        UUID;
CREATE INDEX IF NOT EXISTS idx_documents_company ON documents(company_id);
CREATE TRIGGER documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 6. tickets ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets (
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
CREATE INDEX IF NOT EXISTS idx_tickets_company ON tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_tickets_status  ON tickets(status);
CREATE TRIGGER tickets_updated_at BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 7. ticket_messages ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ticket_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES auth.users(id),
  body        TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON ticket_messages(ticket_id);

-- ─── 8. compliance_items ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compliance_items (
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
CREATE INDEX IF NOT EXISTS idx_compliance_company ON compliance_items(company_id);
CREATE INDEX IF NOT EXISTS idx_compliance_due     ON compliance_items(due_date);

-- ─── 9. reports ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  period       TEXT,
  file_url     TEXT NOT NULL,
  generated_by UUID NOT NULL REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_reports_company ON reports(company_id);


-- ═══════════════════════════════════════════════════════════════════════════════
--  SECTION 3: SERVICES, ACTIONS, MILESTONES, SERVICE REQUESTS, BD
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 10. client_services ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_services (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  service_name      TEXT NOT NULL,
  service_tier      TEXT NOT NULL,
  start_date        DATE NOT NULL,
  end_date          DATE,
  status            TEXT NOT NULL DEFAULT 'active',
  monthly_fee       INTEGER,
  notes             TEXT
);

-- Columns added by later migrations
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS renewal_date      DATE;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS billing_frequency TEXT DEFAULT 'monthly';
CREATE INDEX IF NOT EXISTS idx_client_services_company ON client_services(company_id);
CREATE TRIGGER client_services_updated_at BEFORE UPDATE ON client_services FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 11. actions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS actions (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action_type          TEXT NOT NULL,
  title                TEXT NOT NULL,
  description          TEXT,
  related_entity_id    UUID,
  related_entity_type  TEXT,
  priority             TEXT NOT NULL DEFAULT 'medium',
  status               TEXT NOT NULL DEFAULT 'active',
  dismissed_at         TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  dismiss_until        TIMESTAMPTZ
);

-- Columns added by later migrations
ALTER TABLE actions ADD COLUMN IF NOT EXISTS created_by_admin BOOLEAN DEFAULT FALSE;
ALTER TABLE actions ADD COLUMN IF NOT EXISTS due_date         DATE;
CREATE INDEX IF NOT EXISTS idx_actions_company ON actions(company_id);
CREATE INDEX IF NOT EXISTS idx_actions_status  ON actions(status);
CREATE TRIGGER actions_updated_at BEFORE UPDATE ON actions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 12. milestones ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS milestones (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  pillar      TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  owner       TEXT,
  due_date    DATE,
  status      TEXT NOT NULL DEFAULT 'not_started',
  quarter     TEXT NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_milestones_company ON milestones(company_id);
CREATE INDEX IF NOT EXISTS idx_milestones_quarter ON milestones(quarter);
CREATE TRIGGER milestones_updated_at BEFORE UPDATE ON milestones FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 13. service_requests ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS service_requests (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  submitted_by   UUID NOT NULL REFERENCES auth.users(id),
  request_type   TEXT NOT NULL,
  subject        TEXT NOT NULL,
  details        JSONB NOT NULL DEFAULT '{}',
  urgency        TEXT,
  status         TEXT NOT NULL DEFAULT 'new',
  response_notes TEXT,
  responded_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_service_requests_company ON service_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_service_requests_status  ON service_requests(status);
CREATE TRIGGER service_requests_updated_at BEFORE UPDATE ON service_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 14. bd_companies ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bd_companies (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name            TEXT NOT NULL,
  company_name_normalised TEXT NOT NULL,
  first_seen_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_roles_seen        INTEGER NOT NULL DEFAULT 0,
  status                  TEXT NOT NULL DEFAULT 'prospect',
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bd_companies_normalised ON bd_companies(company_name_normalised);
CREATE INDEX IF NOT EXISTS idx_bd_companies_status    ON bd_companies(status);
CREATE INDEX IF NOT EXISTS idx_bd_companies_last_seen ON bd_companies(last_seen_at DESC);

-- ─── 15. bd_scanned_roles ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bd_scanned_roles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES bd_companies(id) ON DELETE CASCADE,
  role_title    TEXT NOT NULL,
  salary_min    INTEGER,
  salary_max    INTEGER,
  salary_text   TEXT,
  location      TEXT,
  working_model TEXT,
  skills        TEXT[],
  source_url    TEXT NOT NULL,
  source_board  TEXT,
  date_posted   TEXT,
  scanned_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  still_active  BOOLEAN NOT NULL DEFAULT TRUE,
  raw_data      JSONB
);
CREATE INDEX IF NOT EXISTS idx_bd_scanned_roles_company    ON bd_scanned_roles(company_id);
CREATE INDEX IF NOT EXISTS idx_bd_scanned_roles_scanned_at ON bd_scanned_roles(scanned_at DESC);
CREATE INDEX IF NOT EXISTS idx_bd_scanned_roles_active     ON bd_scanned_roles(still_active);


-- ═══════════════════════════════════════════════════════════════════════════════
--  SECTION 4: HIRING (OFFERS, INTERVIEWS, TEMPLATES, BENCHMARKS)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 16. offers ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offers (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requisition_id      UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  candidate_id        UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  base_salary         INTEGER,
  bonus               TEXT,
  benefits            TEXT,
  start_date          DATE,
  notice_period       TEXT,
  contract_type       TEXT,
  working_model       TEXT,
  location            TEXT,
  status              TEXT NOT NULL DEFAULT 'draft',
  sent_at             TIMESTAMPTZ,
  verbal_accepted_at  TIMESTAMPTZ,
  written_accepted_at TIMESTAMPTZ,
  declined_at         TIMESTAMPTZ,
  withdrawn_at        TIMESTAMPTZ,
  deadline            DATE,
  decline_reason      TEXT,
  notes               TEXT,
  created_by          UUID REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_offers_requisition ON offers(requisition_id);
CREATE INDEX IF NOT EXISTS idx_offers_candidate   ON offers(candidate_id);
CREATE INDEX IF NOT EXISTS idx_offers_company     ON offers(company_id);
CREATE INDEX IF NOT EXISTS idx_offers_status      ON offers(status);
CREATE TRIGGER offers_updated_at BEFORE UPDATE ON offers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 17. interview_schedules ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS interview_schedules (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requisition_id   UUID NOT NULL REFERENCES requisitions(id) ON DELETE CASCADE,
  candidate_id     UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  stage_number     INTEGER NOT NULL DEFAULT 1,
  stage_label      TEXT,
  interview_type   TEXT,
  scheduled_at     TIMESTAMPTZ,
  duration_mins    INTEGER,
  location_or_link TEXT,
  interviewers     TEXT[],
  status           TEXT NOT NULL DEFAULT 'scheduled',
  outcome          TEXT,
  feedback_notes   TEXT,
  client_feedback  TEXT,
  created_by       UUID REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_interviews_requisition ON interview_schedules(requisition_id);
CREATE INDEX IF NOT EXISTS idx_interviews_candidate   ON interview_schedules(candidate_id);
CREATE INDEX IF NOT EXISTS idx_interviews_company     ON interview_schedules(company_id);
CREATE TRIGGER interview_schedules_updated_at BEFORE UPDATE ON interview_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 18. jd_templates ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jd_templates (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title         TEXT NOT NULL,
  department    TEXT,
  seniority     TEXT,
  working_model TEXT,
  description   TEXT,
  must_haves    TEXT[],
  benefits      TEXT[],
  tags          TEXT[],
  created_by    UUID REFERENCES auth.users(id)
);
CREATE INDEX IF NOT EXISTS idx_jd_templates_department ON jd_templates(department);
CREATE TRIGGER jd_templates_updated_at BEFORE UPDATE ON jd_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── 19. salary_benchmarks ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS salary_benchmarks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_type      TEXT NOT NULL,
  location       TEXT,
  seniority      TEXT,
  working_model  TEXT,
  salary_p25     INTEGER,
  salary_p50     INTEGER,
  salary_p75     INTEGER,
  salary_p90     INTEGER,
  currency       TEXT NOT NULL DEFAULT 'GBP',
  source         TEXT,
  effective_date DATE,
  notes          TEXT,
  created_by     UUID REFERENCES profiles(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_salary_benchmarks_role     ON salary_benchmarks(role_type);
CREATE INDEX IF NOT EXISTS idx_salary_benchmarks_location ON salary_benchmarks(location);


-- ═══════════════════════════════════════════════════════════════════════════════
--  SECTION 5: LEAD (TRAINING, REVIEWS, SKILLS, LEARNING, EMPLOYEE RECORDS)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 20. training_needs ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS training_needs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  flagged_by    UUID REFERENCES profiles(id),
  employee_name TEXT,
  department    TEXT,
  skill_gap     TEXT NOT NULL,
  priority      TEXT NOT NULL DEFAULT 'medium',
  status        TEXT NOT NULL DEFAULT 'open',
  notes         TEXT,
  target_date   DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_training_needs_company ON training_needs(company_id);

-- ─── 21. performance_reviews ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS performance_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_name   TEXT NOT NULL,
  employee_email  TEXT,
  department      TEXT,
  review_period   TEXT NOT NULL,
  review_type     TEXT NOT NULL DEFAULT 'annual',
  status          TEXT NOT NULL DEFAULT 'pending',
  overall_rating  TEXT,
  reviewer_name   TEXT,
  due_date        DATE,
  completed_at    TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_perf_reviews_company ON performance_reviews(company_id);

-- ─── 22. skills_matrix ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS skills_matrix (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_name   TEXT NOT NULL,
  department      TEXT,
  role_title      TEXT,
  skill_name      TEXT NOT NULL,
  skill_category  TEXT,
  current_level   INTEGER CHECK (current_level BETWEEN 0 AND 5),
  target_level    INTEGER CHECK (target_level BETWEEN 0 AND 5),
  last_assessed   DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_skills_matrix_company ON skills_matrix(company_id);

-- ─── 23. learning_content ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learning_content (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  description     TEXT,
  creator_name    TEXT,
  category        TEXT,
  tags            TEXT[],
  content_type    TEXT NOT NULL DEFAULT 'video',
  file_url        TEXT,
  thumbnail_url   TEXT,
  duration_mins   INTEGER,
  price_pence     INTEGER NOT NULL DEFAULT 0,
  stripe_price_id TEXT,
  is_published    BOOLEAN NOT NULL DEFAULT FALSE,
  is_featured     BOOLEAN NOT NULL DEFAULT FALSE,
  view_count      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_learning_content_published ON learning_content(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_learning_content_category  ON learning_content(category);

-- ─── 24. learning_purchases ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learning_purchases (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id            UUID NOT NULL REFERENCES learning_content(id) ON DELETE CASCADE,
  company_id            UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  purchased_by          UUID REFERENCES profiles(id),
  stripe_session_id     TEXT,
  stripe_payment_intent TEXT,
  amount_pence          INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'pending',
  access_expires_at     TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_learning_purchases_company ON learning_purchases(company_id);
CREATE INDEX IF NOT EXISTS idx_learning_purchases_content ON learning_purchases(content_id);
CREATE INDEX IF NOT EXISTS idx_learning_purchases_status  ON learning_purchases(status);

-- ─── 25. employee_records ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_records (
  id                       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id               UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  full_name                TEXT NOT NULL,
  email                    TEXT,
  phone                    TEXT,
  date_of_birth            DATE,
  gender                   TEXT,
  ethnicity                TEXT,
  nationality              TEXT,
  disability_status        TEXT,
  employee_number          TEXT,
  job_title                TEXT NOT NULL,
  department               TEXT,
  employment_type          TEXT DEFAULT 'full_time',
  status                   employment_status DEFAULT 'active',
  start_date               DATE NOT NULL,
  end_date                 DATE,
  probation_end            DATE,
  salary                   NUMERIC(12,2),
  salary_currency          TEXT DEFAULT 'GBP',
  pay_frequency            TEXT DEFAULT 'monthly',
  line_manager             TEXT,
  work_location            TEXT,
  contract_hours           NUMERIC(5,2),
  emergency_name           TEXT,
  emergency_phone          TEXT,
  emergency_relation       TEXT,
  ni_number                TEXT,
  tax_code                 TEXT,
  annual_leave_allowance   NUMERIC(5,1) NOT NULL DEFAULT 28,
  sick_day_allowance       NUMERIC(5,1),
  leave_year_type          leave_year_type DEFAULT 'fixed',
  leave_year_start_month   INT DEFAULT 1,
  leave_year_start_day     INT DEFAULT 1,
  notes                    TEXT,
  address                  TEXT,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);

-- GDPR columns added by later migration
ALTER TABLE employee_records ADD COLUMN IF NOT EXISTS data_consent_at         TIMESTAMPTZ;
ALTER TABLE employee_records ADD COLUMN IF NOT EXISTS sensitive_data_redacted BOOLEAN DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_employee_records_company ON employee_records(company_id);
CREATE INDEX IF NOT EXISTS idx_employee_records_status  ON employee_records(company_id, status);

CREATE OR REPLACE FUNCTION update_employee_records_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_employee_records_updated ON employee_records;
CREATE TRIGGER trg_employee_records_updated BEFORE UPDATE ON employee_records FOR EACH ROW EXECUTE FUNCTION update_employee_records_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════════
--  SECTION 6: PROTECT (ABSENCE, EMPLOYEE DOCS, HR METRICS, LEAVE, CALENDAR)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 26. employee_documents ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_name   TEXT NOT NULL,
  employee_email  TEXT,
  department      TEXT,
  doc_type        TEXT NOT NULL,
  title           TEXT NOT NULL,
  file_url        TEXT,
  expiry_date     DATE,
  status          TEXT NOT NULL DEFAULT 'active',
  notes           TEXT,
  uploaded_by     UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_emp_docs_company ON employee_documents(company_id);

-- ─── 27. absence_records ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS absence_records (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_name   TEXT NOT NULL,
  employee_email  TEXT,
  department      TEXT,
  absence_type    TEXT NOT NULL,
  start_date      DATE NOT NULL,
  end_date        DATE,
  days            NUMERIC(5,1),
  status          TEXT NOT NULL DEFAULT 'pending',
  notes           TEXT,
  approved_by     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_absence_company ON absence_records(company_id);

-- ─── 28. hr_metrics ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS hr_metrics (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  period           TEXT NOT NULL,
  headcount        INTEGER,
  headcount_target INTEGER,
  turnover_rate    NUMERIC(5,2),
  absence_rate     NUMERIC(5,2),
  gender_m_pct     NUMERIC(5,2),
  gender_f_pct     NUMERIC(5,2),
  gender_other_pct NUMERIC(5,2),
  avg_tenure_months INTEGER,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(company_id, period)
);
CREATE INDEX IF NOT EXISTS idx_hr_metrics_company ON hr_metrics(company_id);

-- ─── 29. leave_records ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_records (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id    UUID NOT NULL REFERENCES employee_records(id) ON DELETE CASCADE,
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  leave_type     leave_type NOT NULL,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  days_count     NUMERIC(5,1) NOT NULL,
  status         leave_status DEFAULT 'pending',
  notes          TEXT,
  approved_by    UUID REFERENCES profiles(id),
  approved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leave_records_employee ON leave_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_records_company  ON leave_records(company_id);
CREATE INDEX IF NOT EXISTS idx_leave_records_dates    ON leave_records(company_id, start_date, end_date);

-- ─── 30. company_calendar_events ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_calendar_events (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title            TEXT NOT NULL,
  event_type       calendar_event_type DEFAULT 'closed_day',
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  all_day          BOOLEAN DEFAULT true,
  start_time       TIME,
  end_time         TIME,
  recurring_yearly BOOLEAN DEFAULT false,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_calendar_events_company ON company_calendar_events(company_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_dates   ON company_calendar_events(company_id, start_date, end_date);


-- ═══════════════════════════════════════════════════════════════════════════════
--  SECTION 7: ONBOARDING, OFFBOARDING, POLICY ACKNOWLEDGEMENTS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 31. onboarding_templates ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_templates (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  is_default  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onboard_templates_company ON onboarding_templates(company_id);

-- ─── 32. onboarding_template_tasks ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_template_tasks (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id    UUID NOT NULL REFERENCES onboarding_templates(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT DEFAULT 'general',
  due_day_offset INT DEFAULT 0,
  assigned_to    TEXT,
  sort_order     INT DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ─── 33. onboarding_instances ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_instances (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id  UUID NOT NULL REFERENCES employee_records(id) ON DELETE CASCADE,
  template_id  UUID REFERENCES onboarding_templates(id),
  status       TEXT DEFAULT 'in_progress',
  started_at   TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onboard_instances_company  ON onboarding_instances(company_id);
CREATE INDEX IF NOT EXISTS idx_onboard_instances_employee ON onboarding_instances(employee_id);

-- ─── 34. onboarding_task_progress ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS onboarding_task_progress (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id      UUID NOT NULL REFERENCES onboarding_instances(id) ON DELETE CASCADE,
  task_title       TEXT NOT NULL,
  task_description TEXT,
  category         TEXT DEFAULT 'general',
  due_date         DATE,
  status           TEXT DEFAULT 'pending',
  completed_at     TIMESTAMPTZ,
  completed_by     UUID REFERENCES profiles(id),
  notes            TEXT,
  sort_order       INT DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_onboard_progress_instance ON onboarding_task_progress(instance_id);

-- ─── 35. offboarding_templates ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offboarding_templates (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  is_default  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offboard_templates_company ON offboarding_templates(company_id);

-- ─── 36. offboarding_template_tasks ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offboarding_template_tasks (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id    UUID NOT NULL REFERENCES offboarding_templates(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT DEFAULT 'general',
  due_day_offset INT DEFAULT 0,
  assigned_to    TEXT,
  sort_order     INT DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ─── 37. offboarding_instances ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offboarding_instances (
  id                   UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id          UUID NOT NULL REFERENCES employee_records(id) ON DELETE CASCADE,
  template_id          UUID REFERENCES offboarding_templates(id),
  last_working_day     DATE,
  reason               TEXT,
  exit_interview_notes TEXT,
  status               TEXT DEFAULT 'in_progress',
  started_at           TIMESTAMPTZ DEFAULT now(),
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offboard_instances_company  ON offboarding_instances(company_id);
CREATE INDEX IF NOT EXISTS idx_offboard_instances_employee ON offboarding_instances(employee_id);

-- ─── 38. offboarding_task_progress ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS offboarding_task_progress (
  id               UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id      UUID NOT NULL REFERENCES offboarding_instances(id) ON DELETE CASCADE,
  task_title       TEXT NOT NULL,
  task_description TEXT,
  category         TEXT DEFAULT 'general',
  due_date         DATE,
  status           TEXT DEFAULT 'pending',
  completed_at     TIMESTAMPTZ,
  completed_by     UUID REFERENCES profiles(id),
  notes            TEXT,
  sort_order       INT DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offboard_progress_instance ON offboarding_task_progress(instance_id);

-- ─── 39. policy_acknowledgements ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS policy_acknowledgements (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  document_id     UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES employee_records(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ,
  status          TEXT DEFAULT 'pending',
  sent_at         TIMESTAMPTZ DEFAULT now(),
  reminder_sent   BOOLEAN DEFAULT false,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT now(),
  UNIQUE(document_id, employee_id)
);
CREATE INDEX IF NOT EXISTS idx_policy_acks_company  ON policy_acknowledgements(company_id);
CREATE INDEX IF NOT EXISTS idx_policy_acks_document ON policy_acknowledgements(document_id);
CREATE INDEX IF NOT EXISTS idx_policy_acks_employee ON policy_acknowledgements(employee_id);


-- ═══════════════════════════════════════════════════════════════════════════════
--  SECTION 8: ADMIN OPERATIONS (NOTIFICATIONS, NOTES, TASKS, ACTIVITY, GDPR)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 40. notifications ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES profiles(id) ON DELETE CASCADE,
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  link        TEXT,
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read, created_at DESC);

-- ─── 41. client_notes ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_notes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES profiles(id),
  note_type   TEXT DEFAULT 'general',
  title       TEXT,
  body        TEXT NOT NULL,
  pinned      BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_notes_company ON client_notes(company_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_author  ON client_notes(author_id);

-- ─── 42. activity_log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id    UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES profiles(id),
  event_type    TEXT NOT NULL,
  title         TEXT NOT NULL,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- GDPR columns added by later migration
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS ip_address    TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS user_agent    TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS data_category TEXT;
CREATE INDEX IF NOT EXISTS idx_activity_log_company ON activity_log(company_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_type    ON activity_log(event_type);

-- ─── 43. internal_tasks ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS internal_tasks (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id   UUID REFERENCES companies(id) ON DELETE CASCADE,
  assigned_to  UUID REFERENCES profiles(id),
  created_by   UUID NOT NULL REFERENCES profiles(id),
  title        TEXT NOT NULL,
  description  TEXT,
  priority     TEXT DEFAULT 'normal',
  status       TEXT DEFAULT 'todo',
  due_date     DATE,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_internal_tasks_assigned ON internal_tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_internal_tasks_status   ON internal_tasks(status);
CREATE INDEX IF NOT EXISTS idx_internal_tasks_company  ON internal_tasks(company_id);

-- ─── 44. data_access_requests (GDPR SARs) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS data_access_requests (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requested_by UUID NOT NULL REFERENCES profiles(id),
  company_id   UUID REFERENCES companies(id),
  request_type TEXT NOT NULL,
  status       TEXT DEFAULT 'pending',
  notes        TEXT,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_data_access_requests_user ON data_access_requests(requested_by);


-- ═══════════════════════════════════════════════════════════════════════════════
--  SECTION 9: INTEGRATIONS (PARTNER KEYS, SYNC, IVYLENS, ASSESSMENTS)
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── 45. partner_api_keys ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS partner_api_keys (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label        TEXT NOT NULL,
  key_hash     TEXT NOT NULL,
  key_prefix   TEXT NOT NULL,
  permissions  TEXT[] NOT NULL DEFAULT '{}',
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_by   UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_partner_api_keys_hash   ON partner_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_partner_api_keys_active ON partner_api_keys(is_active);

-- ─── 46. sync_state ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sync_state (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 47. ivylens_tickets ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ivylens_tickets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ivylens_ticket_id TEXT NOT NULL,
  category          TEXT NOT NULL,
  subject           TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'open',
  priority          TEXT NOT NULL DEFAULT 'normal',
  reference_id      TEXT,
  created_by        UUID REFERENCES profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ivylens_tickets_company ON ivylens_tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_ivylens_tickets_status  ON ivylens_tickets(status);

-- ─── 48. company_assessments ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_assessments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ivylens_company_id UUID,
  employee_count     INTEGER,
  employee_band      TEXT,
  form_responses     JSONB NOT NULL DEFAULT '{}',
  overall_band       TEXT,
  confidence         TEXT,
  dimensions         JSONB DEFAULT '[]',
  top_signals        TEXT[] DEFAULT '{}',
  summary            TEXT,
  benchmarks         JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_company_assessments_company ON company_assessments(company_id);
CREATE INDEX IF NOT EXISTS idx_company_assessments_created ON company_assessments(created_at DESC);

-- ─── 49. company_friction_items ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS company_friction_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  assessment_id UUID REFERENCES company_assessments(id) ON DELETE SET NULL,
  dimension     TEXT NOT NULL,
  field_key     TEXT NOT NULL,
  label         TEXT NOT NULL,
  severity      TEXT,
  is_completed  BOOLEAN NOT NULL DEFAULT false,
  completed_at  TIMESTAMPTZ,
  completed_by  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_friction_items_company ON company_friction_items(company_id);
CREATE INDEX IF NOT EXISTS idx_friction_items_open    ON company_friction_items(company_id) WHERE is_completed = false;


-- ═══════════════════════════════════════════════════════════════════════════════
--  SECTION 10: ROW LEVEL SECURITY POLICIES
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable RLS on all tables
ALTER TABLE companies               ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisitions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates              ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents               ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_services         ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones              ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests        ENABLE ROW LEVEL SECURITY;
ALTER TABLE bd_companies            ENABLE ROW LEVEL SECURITY;
ALTER TABLE bd_scanned_roles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_schedules     ENABLE ROW LEVEL SECURITY;
ALTER TABLE jd_templates            ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_benchmarks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_needs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews     ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills_matrix           ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_content        ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_purchases      ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_records        ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_records           ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_documents      ENABLE ROW LEVEL SECURITY;
ALTER TABLE absence_records         ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_metrics              ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_templates    ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_instances    ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_task_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE offboarding_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE offboarding_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE offboarding_instances   ENABLE ROW LEVEL SECURITY;
ALTER TABLE offboarding_task_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications           ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_notes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_tasks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_access_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_api_keys        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_state              ENABLE ROW LEVEL SECURITY;
ALTER TABLE ivylens_tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_assessments     ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_friction_items  ENABLE ROW LEVEL SECURITY;

-- ─── Core table policies ─────────────────────────────────────────────────────

-- Companies
CREATE POLICY "client_companies"     ON companies FOR SELECT USING (id = my_company_id() OR is_tps_staff());
CREATE POLICY "tps_manage_companies" ON companies FOR ALL    USING (is_tps_staff());

-- Profiles
CREATE POLICY "own_profile"        ON profiles FOR SELECT USING (id = auth.uid() OR company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY "tps_profiles"       ON profiles FOR ALL    USING (is_tps_staff());

-- Requisitions
CREATE POLICY "client_requisitions" ON requisitions FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "client_insert_req"   ON requisitions FOR INSERT WITH CHECK (
  company_id = my_company_id() AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('client_admin','client_user','tps_admin','tps_recruiter'))
);
CREATE POLICY "tps_requisitions"    ON requisitions FOR ALL USING (is_tps_staff());

-- Candidates
CREATE POLICY "client_candidates"  ON candidates FOR SELECT USING (company_id = my_company_id() AND approved_for_client = TRUE OR is_tps_staff());
CREATE POLICY "client_update_cand" ON candidates FOR UPDATE USING (company_id = my_company_id());
CREATE POLICY "tps_candidates"     ON candidates FOR ALL    USING (is_tps_staff());

-- Documents
CREATE POLICY "client_documents" ON documents FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "tps_documents"    ON documents FOR ALL    USING (is_tps_staff());

-- Tickets
CREATE POLICY "client_tickets"        ON tickets FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "client_insert_ticket"  ON tickets FOR INSERT WITH CHECK (
  company_id = my_company_id() AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('client_admin','client_user','tps_admin','tps_recruiter'))
);
CREATE POLICY "client_update_ticket"  ON tickets FOR UPDATE USING (company_id = my_company_id() AND status NOT IN ('resolved','closed'));
CREATE POLICY "tps_tickets"           ON tickets FOR ALL    USING (is_tps_staff());

-- Ticket messages
CREATE POLICY "client_messages"    ON ticket_messages FOR SELECT USING (
  is_internal = FALSE AND EXISTS(SELECT 1 FROM tickets t WHERE t.id = ticket_id AND t.company_id = my_company_id()) OR is_tps_staff()
);
CREATE POLICY "client_insert_msg"  ON ticket_messages FOR INSERT WITH CHECK (
  EXISTS(SELECT 1 FROM tickets t WHERE t.id = ticket_id AND t.company_id = my_company_id())
);
CREATE POLICY "tps_messages"       ON ticket_messages FOR ALL USING (is_tps_staff());

-- Reports, compliance, services, actions, milestones, service_requests
CREATE POLICY "client_reports"     ON reports          FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "tps_reports"        ON reports          FOR ALL    USING (is_tps_staff());
CREATE POLICY "client_compliance"  ON compliance_items FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "tps_compliance"     ON compliance_items FOR ALL    USING (is_tps_staff());
CREATE POLICY "client_services_select" ON client_services FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "tps_client_services"    ON client_services FOR ALL    USING (is_tps_staff());
CREATE POLICY "client_actions_select"  ON actions FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "client_actions_update"  ON actions FOR UPDATE USING (company_id = my_company_id());
CREATE POLICY "tps_actions"            ON actions FOR ALL    USING (is_tps_staff());
CREATE POLICY "client_milestones"      ON milestones FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "tps_milestones"         ON milestones FOR ALL    USING (is_tps_staff());
CREATE POLICY "client_sr_select"       ON service_requests FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "client_sr_insert"       ON service_requests FOR INSERT WITH CHECK (company_id = my_company_id());
CREATE POLICY "tps_service_requests"   ON service_requests FOR ALL    USING (is_tps_staff());

-- BD (admin only)
CREATE POLICY "tps_bd_companies"     ON bd_companies     FOR ALL USING (is_tps_staff());
CREATE POLICY "tps_bd_scanned_roles" ON bd_scanned_roles FOR ALL USING (is_tps_staff());

-- Offers + Interviews
CREATE POLICY "client_offers_select"     ON offers              FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "tps_offers"               ON offers              FOR ALL    USING (is_tps_staff());
CREATE POLICY "client_interviews_select" ON interview_schedules FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY "tps_interviews"           ON interview_schedules FOR ALL    USING (is_tps_staff());

-- JD Templates + Benchmarks (admin manage, all read)
CREATE POLICY "tps_jd_templates"  ON jd_templates     FOR ALL    USING (is_tps_staff());
CREATE POLICY "read_benchmarks"   ON salary_benchmarks FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "admin_benchmarks"  ON salary_benchmarks FOR ALL    USING (is_tps_staff());

-- LEAD tables (company-scoped + admin)
CREATE POLICY "client_training_needs" ON training_needs      FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "admin_training_needs"  ON training_needs      FOR ALL USING (is_tps_staff());
CREATE POLICY "client_perf_reviews"   ON performance_reviews FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "admin_perf_reviews"    ON performance_reviews FOR ALL USING (is_tps_staff());
CREATE POLICY "client_skills_matrix"  ON skills_matrix       FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "admin_skills_matrix"   ON skills_matrix       FOR ALL USING (is_tps_staff());

-- Learning
CREATE POLICY "read_published_content" ON learning_content   FOR SELECT USING (is_published = true AND auth.uid() IS NOT NULL);
CREATE POLICY "admin_learning_content" ON learning_content   FOR ALL    USING (is_tps_staff());
CREATE POLICY "client_purchases_read"  ON learning_purchases FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "client_purchases_insert" ON learning_purchases FOR INSERT WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "admin_purchases"        ON learning_purchases FOR ALL    USING (is_tps_staff());

-- Employee records + leave + calendar
CREATE POLICY employee_records_select ON employee_records FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()) OR is_tps_staff());
CREATE POLICY employee_records_insert ON employee_records FOR INSERT WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
CREATE POLICY employee_records_update ON employee_records FOR UPDATE USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
CREATE POLICY employee_records_delete ON employee_records FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'tps_admin'));
CREATE POLICY leave_records_select ON leave_records FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()) OR is_tps_staff());
CREATE POLICY leave_records_insert ON leave_records FOR INSERT WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
CREATE POLICY leave_records_update ON leave_records FOR UPDATE USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
CREATE POLICY calendar_events_select ON company_calendar_events FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()) OR is_tps_staff());
CREATE POLICY calendar_events_insert ON company_calendar_events FOR INSERT WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
CREATE POLICY calendar_events_update ON company_calendar_events FOR UPDATE USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
CREATE POLICY calendar_events_delete ON company_calendar_events FOR DELETE USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'tps_admin'));

-- PROTECT tables
CREATE POLICY "client_emp_docs"  ON employee_documents FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "admin_emp_docs"   ON employee_documents FOR ALL USING (is_tps_staff());
CREATE POLICY "client_absence"   ON absence_records    FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "admin_absence"    ON absence_records    FOR ALL USING (is_tps_staff());
CREATE POLICY "client_hr_metrics" ON hr_metrics        FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "admin_hr_metrics"  ON hr_metrics        FOR ALL USING (is_tps_staff());

-- Onboarding/Offboarding/Policy acks (company read, client_admin + admin write)
DO $$ BEGIN
  CREATE POLICY onboard_tmpl_sel ON onboarding_templates FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()) OR is_tps_staff());
  CREATE POLICY onboard_tmpl_mod ON onboarding_templates FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
  CREATE POLICY onboard_inst_sel ON onboarding_instances FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()) OR is_tps_staff());
  CREATE POLICY onboard_inst_mod ON onboarding_instances FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
  CREATE POLICY onboard_prog_sel ON onboarding_task_progress FOR SELECT USING (instance_id IN (SELECT id FROM onboarding_instances WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())) OR is_tps_staff());
  CREATE POLICY onboard_prog_mod ON onboarding_task_progress FOR ALL USING (instance_id IN (SELECT id FROM onboarding_instances WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin')) OR is_tps_staff());
  CREATE POLICY onboard_tmpl_tasks_sel ON onboarding_template_tasks FOR SELECT USING (template_id IN (SELECT id FROM onboarding_templates WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())) OR is_tps_staff());
  CREATE POLICY onboard_tmpl_tasks_mod ON onboarding_template_tasks FOR ALL USING (template_id IN (SELECT id FROM onboarding_templates WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin')) OR is_tps_staff());
  CREATE POLICY offboard_tmpl_sel ON offboarding_templates FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()) OR is_tps_staff());
  CREATE POLICY offboard_tmpl_mod ON offboarding_templates FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
  CREATE POLICY offboard_inst_sel ON offboarding_instances FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()) OR is_tps_staff());
  CREATE POLICY offboard_inst_mod ON offboarding_instances FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
  CREATE POLICY offboard_prog_sel ON offboarding_task_progress FOR SELECT USING (instance_id IN (SELECT id FROM offboarding_instances WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())) OR is_tps_staff());
  CREATE POLICY offboard_prog_mod ON offboarding_task_progress FOR ALL USING (instance_id IN (SELECT id FROM offboarding_instances WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin')) OR is_tps_staff());
  CREATE POLICY offboard_tmpl_tasks_sel ON offboarding_template_tasks FOR SELECT USING (template_id IN (SELECT id FROM offboarding_templates WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())) OR is_tps_staff());
  CREATE POLICY offboard_tmpl_tasks_mod ON offboarding_template_tasks FOR ALL USING (template_id IN (SELECT id FROM offboarding_templates WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin')) OR is_tps_staff());
  CREATE POLICY policy_ack_sel ON policy_acknowledgements FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()) OR is_tps_staff());
  CREATE POLICY policy_ack_mod ON policy_acknowledgements FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Notifications
CREATE POLICY "users_own_notifications" ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "users_update_notifications" ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY "auth_insert_notifications" ON notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Admin-only tables
CREATE POLICY "client_notes_all"    ON client_notes      FOR ALL USING (is_tps_staff());
CREATE POLICY "activity_log_select" ON activity_log      FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()) OR is_tps_staff());
CREATE POLICY "activity_log_insert" ON activity_log      FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "internal_tasks_all"  ON internal_tasks    FOR ALL USING (is_tps_staff());
CREATE POLICY "tps_partner_api_keys" ON partner_api_keys FOR ALL USING (is_tps_staff());
CREATE POLICY "tps_sync_state"     ON sync_state         FOR ALL USING (is_tps_staff());
CREATE POLICY "auth_sync_state"    ON sync_state         FOR ALL USING (auth.uid() IS NOT NULL);

-- IvyLens tickets
CREATE POLICY "client_ivylens_tickets" ON ivylens_tickets FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "tps_ivylens_tickets"    ON ivylens_tickets FOR ALL USING (is_tps_staff());

-- Company assessments + friction items
CREATE POLICY "staff_assessments"       ON company_assessments    FOR ALL    USING (is_tps_staff());
CREATE POLICY "client_view_assessments" ON company_assessments    FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "client_insert_assessments" ON company_assessments  FOR INSERT WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "staff_friction_items"    ON company_friction_items FOR ALL    USING (is_tps_staff());
CREATE POLICY "client_view_friction"    ON company_friction_items FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- GDPR data access requests
CREATE POLICY "data_access_req_sel" ON data_access_requests FOR SELECT USING (requested_by = auth.uid() OR is_tps_staff());
CREATE POLICY "data_access_req_ins" ON data_access_requests FOR INSERT WITH CHECK (requested_by = auth.uid());
CREATE POLICY "data_access_req_upd" ON data_access_requests FOR UPDATE USING (is_tps_staff());


-- ═══════════════════════════════════════════════════════════════════════════════
--  SECTION 11: VIEWS
-- ═══════════════════════════════════════════════════════════════════════════════

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


-- ═══════════════════════════════════════════════════════════════════════════════
--  END OF SCHEMA
--  47 tables + 1 view | 13 enums | 5 functions | 7 triggers | ~90 RLS policies
-- ═══════════════════════════════════════════════════════════════════════════════
