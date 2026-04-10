-- ═══════════════════════════════════════════════════════════
-- Sprint 6: Leads table for marketing site lead capture
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS leads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  name          TEXT,
  company       TEXT,
  source        TEXT NOT NULL DEFAULT 'website',    -- exit_intent, hiring_score, hr_risk, dd_checklist, policy_check, email_gate
  problem_type  TEXT,
  metadata      JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at DESC);

-- RLS: service role only (marketing site uses service role for inserts)
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on leads"
  ON leads FOR ALL
  USING (auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin', 'tps_client')
  ));
