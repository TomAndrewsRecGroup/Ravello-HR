-- ═══════════════════════════════════════════════════════════
-- GDPR / ICO COMPLIANCE
-- ═══════════════════════════════════════════════════════════

-- ─── Consent tracking ────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS privacy_consent_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS privacy_consent_version TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS data_processing_consent BOOLEAN DEFAULT false;

-- ─── Data retention / erasure ────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS data_erasure_requested_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS data_erasure_completed_at TIMESTAMPTZ;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS account_deactivated_at TIMESTAMPTZ;

-- ─── Audit log — track all data access and changes ──────
-- (extends existing activity_log table)
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS data_category TEXT;
-- data_category: personal_data, employee_data, financial_data, health_data

-- ─── Data export requests (Subject Access Requests) ──────
CREATE TABLE IF NOT EXISTS data_access_requests (
  id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  requested_by   UUID NOT NULL REFERENCES profiles(id),
  company_id     UUID REFERENCES companies(id),
  request_type   TEXT NOT NULL,  -- 'access', 'erasure', 'rectification', 'portability'
  status         TEXT DEFAULT 'pending',  -- pending, processing, completed, rejected
  notes          TEXT,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_data_access_requests_user ON data_access_requests(requested_by);

ALTER TABLE data_access_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY data_access_req_sel ON data_access_requests FOR SELECT USING (
    requested_by = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_recruiter'))
  );
  CREATE POLICY data_access_req_ins ON data_access_requests FOR INSERT WITH CHECK (
    requested_by = auth.uid()
  );
  CREATE POLICY data_access_req_upd ON data_access_requests FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('ravello_admin','ravello_recruiter'))
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Employee records — sensitive data markers ───────────
ALTER TABLE employee_records ADD COLUMN IF NOT EXISTS data_consent_at TIMESTAMPTZ;
ALTER TABLE employee_records ADD COLUMN IF NOT EXISTS sensitive_data_redacted BOOLEAN DEFAULT false;

-- ─── Security headers note ───────────────────────────────
-- IMPORTANT: The following HTTP headers should be set in next.config.js
-- or via middleware:
-- - Strict-Transport-Security: max-age=31536000; includeSubDomains
-- - X-Content-Type-Options: nosniff
-- - X-Frame-Options: DENY
-- - Referrer-Policy: strict-origin-when-cross-origin
-- - Content-Security-Policy (appropriate for your domain)
-- - Permissions-Policy: camera=(), microphone=(), geolocation=()
