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
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );

CREATE POLICY "admin_perf_reviews" ON performance_reviews
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );

CREATE POLICY "admin_skills_matrix" ON skills_matrix
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );

CREATE POLICY "admin_emp_docs" ON employee_documents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );

CREATE POLICY "admin_absence" ON absence_records
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );

CREATE POLICY "admin_hr_metrics" ON hr_metrics
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );
