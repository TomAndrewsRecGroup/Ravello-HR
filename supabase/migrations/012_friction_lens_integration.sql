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
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin', 'tps_recruiter')));

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
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin', 'tps_recruiter')));

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
