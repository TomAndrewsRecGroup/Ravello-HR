-- ═══════════════════════════════════════════════════════════
-- CLIENT NOTES, ACTIVITY LOG, ENGAGEMENT TRACKING
-- ═══════════════════════════════════════════════════════════

-- ─── Client Notes (CRM-style timeline) ───────────────────
CREATE TABLE IF NOT EXISTS client_notes (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES profiles(id),
  note_type   TEXT DEFAULT 'general',  -- general, call, meeting, email, task, escalation
  title       TEXT,
  body        TEXT NOT NULL,
  pinned      BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_notes_company ON client_notes(company_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_author ON client_notes(author_id);

-- ─── Activity Log (auto-tracked events) ──────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id  UUID REFERENCES companies(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES profiles(id),
  event_type  TEXT NOT NULL,
  -- event_types: login, role_created, role_filled, ticket_created,
  -- ticket_resolved, document_uploaded, compliance_updated,
  -- candidate_added, service_request, feature_toggled, user_invited
  title       TEXT NOT NULL,
  metadata    JSONB DEFAULT '{}',  -- extra context per event
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_company ON activity_log(company_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log(event_type);

-- ─── Client engagement columns on companies ──────────────
ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_portal_login TIMESTAMPTZ;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS login_count_30d INT DEFAULT 0;

-- ─── Revenue tracking columns on client_services ─────────
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS renewal_date DATE;
ALTER TABLE client_services ADD COLUMN IF NOT EXISTS billing_frequency TEXT DEFAULT 'monthly';

-- ─── RLS ─────────────────────────────────────────────────
ALTER TABLE client_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  -- Client notes: ravello staff only
  CREATE POLICY client_notes_all ON client_notes FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );

  -- Activity log: ravello staff can read all, company users can read own
  CREATE POLICY activity_log_select ON activity_log FOR SELECT USING (
    company_id IN (SELECT company_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('tps_admin','tps_recruiter'))
  );
  CREATE POLICY activity_log_insert ON activity_log FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid())
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
