-- ══════════════════════════════════════════════════════════════════════════════
--  THE PEOPLE SYSTEM — FRESH INSTALL SCHEMA
--  Run on a CLEAN Supabase project (no existing tables).
--  Drop all tables first if re-running: see bottom of file for DROP commands.
--  Generated: April 2026 | 47 tables | 13 enums
-- ══════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══ ENUMS ═══════════════════════════════════════════════════════════════════
CREATE TYPE user_role             AS ENUM ('client_admin','client_user','tps_admin','tps_client');
CREATE TYPE hiring_stage          AS ENUM ('submitted','in_progress','shortlist_ready','interview','offer','filled','cancelled');
CREATE TYPE ticket_status         AS ENUM ('open','in_progress','resolved','closed');
CREATE TYPE ticket_priority       AS ENUM ('low','normal','high','urgent');
CREATE TYPE doc_category          AS ENUM ('contract','policy','letter','report','other');
CREATE TYPE compliance_status     AS ENUM ('pending','in_review','complete','overdue');
CREATE TYPE candidate_client_status AS ENUM ('pending','approved','rejected','info_requested');
CREATE TYPE employment_status     AS ENUM ('active','on_leave','terminated','probation');
CREATE TYPE leave_type            AS ENUM ('annual_leave','sick_day','bank_holiday','unpaid','maternity','paternity','compassionate','other');
CREATE TYPE leave_status          AS ENUM ('pending','approved','rejected','cancelled');
CREATE TYPE leave_year_type       AS ENUM ('rolling','fixed');
CREATE TYPE calendar_event_type   AS ENUM ('closed_day','bank_holiday','company_event','other');


-- ═══ FUNCTIONS ═══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;


-- ═══ TABLE 1: companies ═════════════════════════════════════════════════════
CREATE TABLE companies (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  name                   TEXT NOT NULL,
  slug                   TEXT NOT NULL UNIQUE,
  size_band              TEXT,
  sector                 TEXT,
  contact_email          TEXT,
  active                 BOOLEAN NOT NULL DEFAULT TRUE,
  feature_flags          JSONB NOT NULL DEFAULT '{}',
  manatal_client_id      TEXT,
  friction_band          TEXT,
  friction_assessment_id UUID,
  ivylens_company_id     UUID,
  onboarding_status      TEXT DEFAULT 'not_started',
  last_portal_login      TIMESTAMPTZ,
  login_count_30d        INT DEFAULT 0
);
-- account_owner_id added after profiles table exists


-- ═══ TABLE 2: profiles ══════════════════════════════════════════════════════
CREATE TABLE profiles (
  id                        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id                UUID REFERENCES companies(id) ON DELETE SET NULL,
  email                     TEXT NOT NULL,
  full_name                 TEXT,
  role                      user_role NOT NULL DEFAULT 'client_user',
  avatar_url                TEXT,
  onboarding_completed      BOOLEAN NOT NULL DEFAULT FALSE,
  onboarding_step           INTEGER NOT NULL DEFAULT 0,
  ui_preferences            JSONB DEFAULT '{}',
  privacy_consent_at        TIMESTAMPTZ,
  privacy_consent_version   TEXT,
  marketing_consent         BOOLEAN DEFAULT false,
  data_processing_consent   BOOLEAN DEFAULT false,
  data_erasure_requested_at TIMESTAMPTZ,
  data_erasure_completed_at TIMESTAMPTZ,
  account_deactivated_at    TIMESTAMPTZ
);

-- Now add the FK that companies needs
ALTER TABLE companies ADD COLUMN account_owner_id UUID REFERENCES profiles(id);

-- Auto-create profile on sign up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO profiles (id, email) VALUES (NEW.id, NEW.email); RETURN NEW; END;
$$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Helper functions (need profiles to exist)
CREATE OR REPLACE FUNCTION my_company_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT company_id FROM profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION is_tps_staff()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_client'));
$$;


-- ═══ TABLE 3: requisitions ══════════════════════════════════════════════════
CREATE TABLE requisitions (
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
  assigned_recruiter       TEXT,
  working_model            TEXT,
  interview_stages         INTEGER,
  reason_for_hire          TEXT,
  urgency                  TEXT,
  reporting_line           TEXT,
  jd_text                  TEXT,
  friction_score           JSONB,
  friction_level           TEXT,
  friction_recommendations JSONB,
  friction_scored_at       TIMESTAMPTZ,
  approved_by              UUID REFERENCES profiles(id),
  approved_at              TIMESTAMPTZ,
  managed_by               TEXT DEFAULT 'tpo',
  internal_applicants      JSONB DEFAULT '[]'
);
CREATE INDEX idx_requisitions_company ON requisitions(company_id);
CREATE INDEX idx_requisitions_stage   ON requisitions(stage);
CREATE TRIGGER requisitions_updated_at BEFORE UPDATE ON requisitions FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ═══ TABLE 4: candidates ════════════════════════════════════════════════════
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
  client_feedback     TEXT,
  cv_file_path        TEXT,
  cv_file_name        TEXT,
  screening_score     INTEGER CHECK (screening_score BETWEEN 1 AND 10),
  screening_notes     TEXT,
  screened_at         TIMESTAMPTZ,
  screened_by         UUID REFERENCES auth.users(id),
  source              TEXT,
  pipeline_stage      TEXT NOT NULL DEFAULT 'applied'
);
CREATE INDEX idx_candidates_req ON candidates(requisition_id);


-- ═══ TABLE 5: documents ═════════════════════════════════════════════════════
CREATE TABLE documents (
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
  notes            TEXT,
  status           TEXT NOT NULL DEFAULT 'active',
  requires_approval BOOLEAN NOT NULL DEFAULT FALSE,
  approved_at      TIMESTAMPTZ,
  approved_by      UUID REFERENCES auth.users(id),
  file_path        TEXT,
  parent_id        UUID REFERENCES documents(id)
);
CREATE INDEX idx_documents_company ON documents(company_id);
CREATE TRIGGER documents_updated_at BEFORE UPDATE ON documents FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ═══ TABLE 6-7: tickets + messages ══════════════════════════════════════════
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
CREATE TRIGGER tickets_updated_at BEFORE UPDATE ON tickets FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE ticket_messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ticket_id   UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  sender_id   UUID NOT NULL REFERENCES auth.users(id),
  body        TEXT NOT NULL,
  is_internal BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_ticket_messages_ticket ON ticket_messages(ticket_id);


-- ═══ TABLE 8-9: compliance + reports ════════════════════════════════════════
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

CREATE TABLE reports (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  period       TEXT,
  file_url     TEXT NOT NULL,
  generated_by UUID NOT NULL REFERENCES auth.users(id)
);


-- ═══ TABLE 10-13: services, actions, milestones, service_requests ═══════════
CREATE TABLE client_services (
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
  notes             TEXT,
  renewal_date      DATE,
  billing_frequency TEXT DEFAULT 'monthly'
);
CREATE INDEX idx_client_services_company ON client_services(company_id);
CREATE TRIGGER client_services_updated_at BEFORE UPDATE ON client_services FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE actions (
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
  dismiss_until        TIMESTAMPTZ,
  created_by_admin     BOOLEAN NOT NULL DEFAULT FALSE,
  due_date             DATE
);
CREATE INDEX idx_actions_company ON actions(company_id);
CREATE TRIGGER actions_updated_at BEFORE UPDATE ON actions FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE milestones (
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
CREATE INDEX idx_milestones_company ON milestones(company_id);
CREATE TRIGGER milestones_updated_at BEFORE UPDATE ON milestones FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE service_requests (
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
CREATE INDEX idx_service_requests_company ON service_requests(company_id);
CREATE TRIGGER service_requests_updated_at BEFORE UPDATE ON service_requests FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ═══ TABLE 14-15: BD intelligence ═══════════════════════════════════════════
CREATE TABLE bd_companies (
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
CREATE UNIQUE INDEX idx_bd_companies_normalised ON bd_companies(company_name_normalised);

CREATE TABLE bd_scanned_roles (
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
CREATE INDEX idx_bd_scanned_roles_company ON bd_scanned_roles(company_id);


-- ═══ TABLE 16-17: offers + interviews ═══════════════════════════════════════
CREATE TABLE offers (
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
CREATE INDEX idx_offers_requisition ON offers(requisition_id);
CREATE TRIGGER offers_updated_at BEFORE UPDATE ON offers FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE interview_schedules (
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
CREATE INDEX idx_interviews_requisition ON interview_schedules(requisition_id);
CREATE TRIGGER interview_schedules_updated_at BEFORE UPDATE ON interview_schedules FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ═══ TABLE 18-19: JD templates + salary benchmarks ══════════════════════════
CREATE TABLE jd_templates (
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
CREATE TRIGGER jd_templates_updated_at BEFORE UPDATE ON jd_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TABLE salary_benchmarks (
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


-- ═══ TABLE 20-24: LEAD module ═══════════════════════════════════════════════
CREATE TABLE training_needs (
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

CREATE TABLE performance_reviews (
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

CREATE TABLE skills_matrix (
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

CREATE TABLE learning_content (
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

CREATE TABLE learning_purchases (
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


-- ═══ TABLE 25: employee_records ═════════════════════════════════════════════
CREATE TABLE employee_records (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  data_consent_at          TIMESTAMPTZ,
  sensitive_data_redacted  BOOLEAN DEFAULT false,
  created_at               TIMESTAMPTZ DEFAULT now(),
  updated_at               TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_employee_records_company ON employee_records(company_id);


-- ═══ TABLE 26-30: PROTECT module ════════════════════════════════════════════
CREATE TABLE employee_documents (
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

CREATE TABLE absence_records (
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

CREATE TABLE hr_metrics (
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

CREATE TABLE leave_records (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE TABLE company_calendar_events (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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


-- ═══ TABLE 31-39: onboarding, offboarding, policy acks ═════════════════════
CREATE TABLE onboarding_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  is_default  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE onboarding_template_tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    UUID NOT NULL REFERENCES onboarding_templates(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT DEFAULT 'general',
  due_day_offset INT DEFAULT 0,
  assigned_to    TEXT,
  sort_order     INT DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE onboarding_instances (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id  UUID NOT NULL REFERENCES employee_records(id) ON DELETE CASCADE,
  template_id  UUID REFERENCES onboarding_templates(id),
  status       TEXT DEFAULT 'in_progress',
  started_at   TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE onboarding_task_progress (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE TABLE offboarding_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  is_default  BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE offboarding_template_tasks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id    UUID NOT NULL REFERENCES offboarding_templates(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  description    TEXT,
  category       TEXT DEFAULT 'general',
  due_day_offset INT DEFAULT 0,
  assigned_to    TEXT,
  sort_order     INT DEFAULT 0,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE offboarding_instances (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE TABLE offboarding_task_progress (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE TABLE policy_acknowledgements (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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


-- ═══ TABLE 40-49: admin ops + integrations ══════════════════════════════════
CREATE TABLE notifications (
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
CREATE INDEX idx_notifications_user ON notifications(user_id, read, created_at DESC);

CREATE TABLE client_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES profiles(id),
  note_type   TEXT DEFAULT 'general',
  title       TEXT,
  body        TEXT NOT NULL,
  pinned      BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE activity_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id       UUID REFERENCES profiles(id),
  event_type    TEXT NOT NULL,
  title         TEXT NOT NULL,
  metadata      JSONB DEFAULT '{}',
  ip_address    TEXT,
  user_agent    TEXT,
  data_category TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_activity_log_created ON activity_log(created_at DESC);

CREATE TABLE internal_tasks (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE TABLE data_access_requests (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL REFERENCES profiles(id),
  company_id   UUID REFERENCES companies(id),
  request_type TEXT NOT NULL,
  status       TEXT DEFAULT 'pending',
  notes        TEXT,
  completed_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE partner_api_keys (
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
CREATE INDEX idx_partner_api_keys_hash ON partner_api_keys(key_hash);

CREATE TABLE sync_state (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ivylens_tickets (
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

CREATE TABLE company_assessments (
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

CREATE TABLE company_friction_items (
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


-- ═══ ROW LEVEL SECURITY ═════════════════════════════════════════════════════
-- Enable on ALL tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE bd_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE bd_scanned_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE interview_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE jd_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills_matrix ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE absence_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE hr_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_task_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE offboarding_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE offboarding_template_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE offboarding_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE offboarding_task_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE internal_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE partner_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE ivylens_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_friction_items ENABLE ROW LEVEL SECURITY;

-- ─── Core policies ──────────────────────────────────────────────────────────
CREATE POLICY co_sel ON companies FOR SELECT USING (id = my_company_id() OR is_tps_staff());
CREATE POLICY co_all ON companies FOR ALL USING (is_tps_staff());
CREATE POLICY pr_sel ON profiles FOR SELECT USING (id = auth.uid() OR company_id = my_company_id() OR is_tps_staff());
CREATE POLICY pr_upd ON profiles FOR UPDATE USING (id = auth.uid());
CREATE POLICY pr_all ON profiles FOR ALL USING (is_tps_staff());
CREATE POLICY rq_sel ON requisitions FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY rq_ins ON requisitions FOR INSERT WITH CHECK (company_id = my_company_id());
CREATE POLICY rq_all ON requisitions FOR ALL USING (is_tps_staff());
CREATE POLICY ca_sel ON candidates FOR SELECT USING ((company_id = my_company_id() AND approved_for_client) OR is_tps_staff());
CREATE POLICY ca_upd ON candidates FOR UPDATE USING (company_id = my_company_id());
CREATE POLICY ca_all ON candidates FOR ALL USING (is_tps_staff());
CREATE POLICY dc_sel ON documents FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY dc_all ON documents FOR ALL USING (is_tps_staff());
CREATE POLICY tk_sel ON tickets FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY tk_ins ON tickets FOR INSERT WITH CHECK (company_id = my_company_id());
CREATE POLICY tk_all ON tickets FOR ALL USING (is_tps_staff());
CREATE POLICY tm_sel ON ticket_messages FOR SELECT USING ((is_internal = FALSE AND EXISTS(SELECT 1 FROM tickets t WHERE t.id = ticket_id AND t.company_id = my_company_id())) OR is_tps_staff());
CREATE POLICY tm_ins ON ticket_messages FOR INSERT WITH CHECK (EXISTS(SELECT 1 FROM tickets t WHERE t.id = ticket_id AND t.company_id = my_company_id()));
CREATE POLICY tm_all ON ticket_messages FOR ALL USING (is_tps_staff());
CREATE POLICY ci_sel ON compliance_items FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY ci_all ON compliance_items FOR ALL USING (is_tps_staff());
CREATE POLICY rp_sel ON reports FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY rp_all ON reports FOR ALL USING (is_tps_staff());
CREATE POLICY cs_sel ON client_services FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY cs_all ON client_services FOR ALL USING (is_tps_staff());
CREATE POLICY ac_sel ON actions FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY ac_upd ON actions FOR UPDATE USING (company_id = my_company_id());
CREATE POLICY ac_all ON actions FOR ALL USING (is_tps_staff());
CREATE POLICY ms_sel ON milestones FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY ms_all ON milestones FOR ALL USING (is_tps_staff());
CREATE POLICY sr_sel ON service_requests FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY sr_ins ON service_requests FOR INSERT WITH CHECK (company_id = my_company_id());
CREATE POLICY sr_all ON service_requests FOR ALL USING (is_tps_staff());

-- BD (admin only)
CREATE POLICY bd_co_all ON bd_companies FOR ALL USING (is_tps_staff());
CREATE POLICY bd_ro_all ON bd_scanned_roles FOR ALL USING (is_tps_staff());

-- Offers + interviews
CREATE POLICY of_sel ON offers FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY of_all ON offers FOR ALL USING (is_tps_staff());
CREATE POLICY iv_sel ON interview_schedules FOR SELECT USING (company_id = my_company_id() OR is_tps_staff());
CREATE POLICY iv_all ON interview_schedules FOR ALL USING (is_tps_staff());

-- Templates + benchmarks
CREATE POLICY jd_all ON jd_templates FOR ALL USING (is_tps_staff());
CREATE POLICY sb_sel ON salary_benchmarks FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY sb_all ON salary_benchmarks FOR ALL USING (is_tps_staff());

-- LEAD (company + admin)
CREATE POLICY tn_cl ON training_needs FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY tn_ad ON training_needs FOR ALL USING (is_tps_staff());
CREATE POLICY rv_cl ON performance_reviews FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY rv_ad ON performance_reviews FOR ALL USING (is_tps_staff());
CREATE POLICY sm_cl ON skills_matrix FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY sm_ad ON skills_matrix FOR ALL USING (is_tps_staff());

-- Learning
CREATE POLICY lc_pub ON learning_content FOR SELECT USING (is_published AND auth.uid() IS NOT NULL);
CREATE POLICY lc_ad ON learning_content FOR ALL USING (is_tps_staff());
CREATE POLICY lp_sel ON learning_purchases FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY lp_ins ON learning_purchases FOR INSERT WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY lp_ad ON learning_purchases FOR ALL USING (is_tps_staff());

-- Employee records + leave + calendar
CREATE POLICY er_sel ON employee_records FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()) OR is_tps_staff());
CREATE POLICY er_ins ON employee_records FOR INSERT WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
CREATE POLICY er_upd ON employee_records FOR UPDATE USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
CREATE POLICY er_del ON employee_records FOR DELETE USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'tps_admin'));
CREATE POLICY lr_sel ON leave_records FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()) OR is_tps_staff());
CREATE POLICY lr_ins ON leave_records FOR INSERT WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
CREATE POLICY lr_upd ON leave_records FOR UPDATE USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
CREATE POLICY ce_sel ON company_calendar_events FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()) OR is_tps_staff());
CREATE POLICY ce_ins ON company_calendar_events FOR INSERT WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
CREATE POLICY ce_upd ON company_calendar_events FOR UPDATE USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
CREATE POLICY ce_del ON company_calendar_events FOR DELETE USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'tps_admin'));

-- PROTECT
CREATE POLICY ed_cl ON employee_documents FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY ed_ad ON employee_documents FOR ALL USING (is_tps_staff());
CREATE POLICY ab_cl ON absence_records FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY ab_ad ON absence_records FOR ALL USING (is_tps_staff());
CREATE POLICY hm_cl ON hr_metrics FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY hm_ad ON hr_metrics FOR ALL USING (is_tps_staff());

-- Onboarding / offboarding / policy acks
CREATE POLICY ob_t_sel ON onboarding_templates FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()) OR is_tps_staff());
CREATE POLICY ob_t_all ON onboarding_templates FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
CREATE POLICY ob_i_sel ON onboarding_instances FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()) OR is_tps_staff());
CREATE POLICY ob_i_all ON onboarding_instances FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
CREATE POLICY ob_p_sel ON onboarding_task_progress FOR SELECT USING (instance_id IN (SELECT id FROM onboarding_instances WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())) OR is_tps_staff());
CREATE POLICY ob_p_all ON onboarding_task_progress FOR ALL USING (instance_id IN (SELECT id FROM onboarding_instances WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin')) OR is_tps_staff());
CREATE POLICY ob_tt_sel ON onboarding_template_tasks FOR SELECT USING (template_id IN (SELECT id FROM onboarding_templates WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())) OR is_tps_staff());
CREATE POLICY ob_tt_all ON onboarding_template_tasks FOR ALL USING (template_id IN (SELECT id FROM onboarding_templates WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin')) OR is_tps_staff());
CREATE POLICY of_t_sel ON offboarding_templates FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()) OR is_tps_staff());
CREATE POLICY of_t_all ON offboarding_templates FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
CREATE POLICY of_i_sel ON offboarding_instances FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()) OR is_tps_staff());
CREATE POLICY of_i_all ON offboarding_instances FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());
CREATE POLICY of_p_sel ON offboarding_task_progress FOR SELECT USING (instance_id IN (SELECT id FROM offboarding_instances WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())) OR is_tps_staff());
CREATE POLICY of_p_all ON offboarding_task_progress FOR ALL USING (instance_id IN (SELECT id FROM offboarding_instances WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin')) OR is_tps_staff());
CREATE POLICY of_tt_sel ON offboarding_template_tasks FOR SELECT USING (template_id IN (SELECT id FROM offboarding_templates WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())) OR is_tps_staff());
CREATE POLICY of_tt_all ON offboarding_template_tasks FOR ALL USING (template_id IN (SELECT id FROM offboarding_templates WHERE company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin')) OR is_tps_staff());
CREATE POLICY pa_sel ON policy_acknowledgements FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()) OR is_tps_staff());
CREATE POLICY pa_all ON policy_acknowledgements FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role = 'client_admin') OR is_tps_staff());

-- Notifications
CREATE POLICY nt_sel ON notifications FOR SELECT USING (user_id = auth.uid());
CREATE POLICY nt_upd ON notifications FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY nt_ins ON notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Admin-only tables
CREATE POLICY cn_all ON client_notes FOR ALL USING (is_tps_staff());
CREATE POLICY al_sel ON activity_log FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()) OR is_tps_staff());
CREATE POLICY al_ins ON activity_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY it_all ON internal_tasks FOR ALL USING (is_tps_staff());
CREATE POLICY pk_all ON partner_api_keys FOR ALL USING (is_tps_staff());
CREATE POLICY ss_all ON sync_state FOR ALL USING (auth.uid() IS NOT NULL);
CREATE POLICY il_cl ON ivylens_tickets FOR ALL USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY il_ad ON ivylens_tickets FOR ALL USING (is_tps_staff());
CREATE POLICY ca_s_all ON company_assessments FOR ALL USING (is_tps_staff());
CREATE POLICY ca_s_sel ON company_assessments FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY ca_s_ins ON company_assessments FOR INSERT WITH CHECK (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY fi_all ON company_friction_items FOR ALL USING (is_tps_staff());
CREATE POLICY fi_sel ON company_friction_items FOR SELECT USING (company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY da_sel ON data_access_requests FOR SELECT USING (requested_by = auth.uid() OR is_tps_staff());
CREATE POLICY da_ins ON data_access_requests FOR INSERT WITH CHECK (requested_by = auth.uid());
CREATE POLICY da_upd ON data_access_requests FOR UPDATE USING (is_tps_staff());


-- ═══ VIEW ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW bd_leads_view AS
SELECT bc.id AS company_id, bc.company_name, bc.notes AS company_location, bc.status, bc.last_seen_at AS sent_at,
  COALESCE(json_agg(json_build_object('role_title',r.role_title,'salary_text',r.salary_text,'location',r.location,'working_model',r.working_model,'source_board',r.source_board,'date_posted',r.date_posted)) FILTER (WHERE r.id IS NOT NULL),'[]'::json) AS roles
FROM bd_companies bc LEFT JOIN bd_scanned_roles r ON r.company_id = bc.id AND r.still_active = TRUE
WHERE bc.status IN ('prospect','contacted')
GROUP BY bc.id, bc.company_name, bc.notes, bc.status, bc.last_seen_at ORDER BY bc.last_seen_at DESC;

-- ═══ END ════════════════════════════════════════════════════════════════════
