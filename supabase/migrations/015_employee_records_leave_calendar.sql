-- ═══════════════════════════════════════════════════════════
-- EMPLOYEE RECORDS, LEAVE MANAGEMENT & COMPANY CALENDAR
-- ═══════════════════════════════════════════════════════════

-- ─── Employment type enum ────────────────────────────────
DO $$ BEGIN
  CREATE TYPE employment_status AS ENUM ('active', 'on_leave', 'terminated', 'probation');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE leave_type AS ENUM (
    'annual_leave', 'sick_day', 'bank_holiday', 'unpaid',
    'maternity', 'paternity', 'compassionate', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE leave_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE leave_year_type AS ENUM ('rolling', 'fixed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE calendar_event_type AS ENUM (
    'closed_day', 'bank_holiday', 'company_event', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Employee Records ────────────────────────────────────
CREATE TABLE IF NOT EXISTS employee_records (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Personal info
  full_name         TEXT NOT NULL,
  email             TEXT,
  phone             TEXT,
  date_of_birth     DATE,
  gender            TEXT,                -- free text: Male, Female, Non-binary, Prefer not to say, etc.
  ethnicity         TEXT,                -- free text for DE&I
  nationality       TEXT,
  disability_status TEXT,                -- Yes, No, Prefer not to say

  -- Employment info
  employee_number   TEXT,                -- company's own reference
  job_title         TEXT NOT NULL,
  department        TEXT,
  employment_type   TEXT DEFAULT 'full_time',  -- full_time, part_time, contractor, intern
  status            employment_status DEFAULT 'active',
  start_date        DATE NOT NULL,
  end_date          DATE,                -- null = still employed
  probation_end     DATE,
  salary            NUMERIC(12,2),
  salary_currency   TEXT DEFAULT 'GBP',
  pay_frequency     TEXT DEFAULT 'monthly', -- monthly, weekly, fortnightly
  line_manager      TEXT,
  work_location     TEXT,
  contract_hours    NUMERIC(5,2),        -- hours per week

  -- Emergency contact
  emergency_name    TEXT,
  emergency_phone   TEXT,
  emergency_relation TEXT,

  -- National identifiers
  ni_number         TEXT,                -- UK National Insurance
  tax_code          TEXT,

  -- Leave configuration per employee
  annual_leave_allowance  NUMERIC(5,1) NOT NULL DEFAULT 28,  -- days per year
  sick_day_allowance      NUMERIC(5,1),                      -- null = no formal limit
  leave_year_type         leave_year_type DEFAULT 'fixed',
  leave_year_start_month  INT DEFAULT 1,    -- 1-12, for 'fixed' type
  leave_year_start_day    INT DEFAULT 1,    -- 1-31, for 'fixed' type

  -- Notes
  notes             TEXT,
  address           TEXT,

  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_employee_records_company ON employee_records(company_id);
CREATE INDEX IF NOT EXISTS idx_employee_records_status  ON employee_records(company_id, status);

-- ─── Leave Records ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_records (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id    UUID NOT NULL REFERENCES employee_records(id) ON DELETE CASCADE,
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  leave_type     leave_type NOT NULL,
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  days_count     NUMERIC(5,1) NOT NULL,   -- supports half days (0.5)
  status         leave_status DEFAULT 'pending',
  notes          TEXT,
  approved_by    UUID REFERENCES profiles(id),
  approved_at    TIMESTAMPTZ,

  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_records_employee ON leave_records(employee_id);
CREATE INDEX IF NOT EXISTS idx_leave_records_company  ON leave_records(company_id);
CREATE INDEX IF NOT EXISTS idx_leave_records_dates    ON leave_records(company_id, start_date, end_date);

-- ─── Company Calendar Events ─────────────────────────────
CREATE TABLE IF NOT EXISTS company_calendar_events (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  title          TEXT NOT NULL,
  event_type     calendar_event_type DEFAULT 'closed_day',
  start_date     DATE NOT NULL,
  end_date       DATE NOT NULL,
  all_day        BOOLEAN DEFAULT true,
  start_time     TIME,
  end_time       TIME,
  recurring_yearly BOOLEAN DEFAULT false,
  notes          TEXT,

  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_events_company ON company_calendar_events(company_id);
CREATE INDEX IF NOT EXISTS idx_calendar_events_dates   ON company_calendar_events(company_id, start_date, end_date);

-- ─── Updated-at trigger ──────────────────────────────────
CREATE OR REPLACE FUNCTION update_employee_records_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_employee_records_updated ON employee_records;
CREATE TRIGGER trg_employee_records_updated
  BEFORE UPDATE ON employee_records
  FOR EACH ROW
  EXECUTE FUNCTION update_employee_records_updated_at();

-- ─── RLS ─────────────────────────────────────────────────
ALTER TABLE employee_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_calendar_events ENABLE ROW LEVEL SECURITY;

-- Helper: check if user is ravello staff
-- (reuse existing is_ravello_staff() if available, else define)

-- Employee records: company users can read, ravello staff can read/write
CREATE POLICY employee_records_select ON employee_records
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin', 'tps_recruiter'))
  );

CREATE POLICY employee_records_insert ON employee_records
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('client_admin'))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin', 'tps_recruiter'))
  );

CREATE POLICY employee_records_update ON employee_records
  FOR UPDATE USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('client_admin'))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin', 'tps_recruiter'))
  );

CREATE POLICY employee_records_delete ON employee_records
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin'))
  );

-- Leave records: same pattern
CREATE POLICY leave_records_select ON leave_records
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin', 'tps_recruiter'))
  );

CREATE POLICY leave_records_insert ON leave_records
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('client_admin'))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin', 'tps_recruiter'))
  );

CREATE POLICY leave_records_update ON leave_records
  FOR UPDATE USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('client_admin'))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin', 'tps_recruiter'))
  );

-- Calendar events: same pattern
CREATE POLICY calendar_events_select ON company_calendar_events
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin', 'tps_recruiter'))
  );

CREATE POLICY calendar_events_insert ON company_calendar_events
  FOR INSERT WITH CHECK (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('client_admin'))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin', 'tps_recruiter'))
  );

CREATE POLICY calendar_events_update ON company_calendar_events
  FOR UPDATE USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('client_admin'))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin', 'tps_recruiter'))
  );

CREATE POLICY calendar_events_delete ON company_calendar_events
  FOR DELETE USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid() AND role IN ('client_admin'))
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin'))
  );
