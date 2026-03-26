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
