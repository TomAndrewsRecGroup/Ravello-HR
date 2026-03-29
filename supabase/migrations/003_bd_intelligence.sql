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

CREATE POLICY "tps_bd_companies"     ON bd_companies     FOR ALL USING (is_tps_staff());
CREATE POLICY "tps_bd_scanned_roles" ON bd_scanned_roles FOR ALL USING (is_tps_staff());

-- Extension can INSERT via service role key (configured in extension)
-- No client-facing access needed for BD intelligence tables
