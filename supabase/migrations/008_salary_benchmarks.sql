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
