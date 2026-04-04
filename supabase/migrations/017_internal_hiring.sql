-- ═══════════════════════════════════════════════════════════
-- INTERNAL HIRING — managed_by column on requisitions
-- ═══════════════════════════════════════════════════════════

-- Add managed_by column: 'tpo' (default) or 'internal'
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS managed_by TEXT DEFAULT 'tpo';

-- Add internal-only fields
ALTER TABLE requisitions ADD COLUMN IF NOT EXISTS internal_applicants JSONB DEFAULT '[]';
-- Structure: [{name, email, cv_url, status, applied_at, notes}]
