-- ════════════════════════════════════════════════════════════════════════
-- Migration 046: Per-employee leave tokens + employee notes log
-- ────────────────────────────────────────────────────────────────────────
-- Phase 3b of the onboarding/UX plan adds a public leave-request flow.
-- Every employee gets a unique, regeneratable token; the public form at
-- /leave/{token} is anonymous (no portal seat consumed) and submissions
-- land as `pending` absence_records that the company's Admin or Editor
-- approves or denies from the portal.
--
-- Schema additions:
--   1. employee_records.leave_token  — random unique 32-char token
--   2. employee_notes (new table)    — log of notes attached to an
--      employee (denial reasons, general HR notes, etc.) with author
--      + timestamp + optional related row.
--
-- Idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════
-- 1. employee_records.leave_token
-- ════════════════════════════════════════════════════════════════

ALTER TABLE employee_records
  ADD COLUMN IF NOT EXISTS leave_token TEXT;

-- Generate tokens for every existing employee that doesn't have one.
-- gen_random_bytes(20) → ~40-char hex; truncated to 32 for URL ergonomics.
UPDATE employee_records
   SET leave_token = encode(gen_random_bytes(16), 'hex')
 WHERE leave_token IS NULL;

-- Now make it NOT NULL with a default so future inserts auto-token.
ALTER TABLE employee_records
  ALTER COLUMN leave_token SET DEFAULT encode(gen_random_bytes(16), 'hex'),
  ALTER COLUMN leave_token SET NOT NULL;

-- Unique + indexed for fast token lookup on the public endpoint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public'
       AND indexname  = 'idx_employee_records_leave_token'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX idx_employee_records_leave_token ON employee_records (leave_token)';
  END IF;
END $$;


-- ════════════════════════════════════════════════════════════════
-- 1b. absence_records.employee_id — link a leave row to an employee
-- ════════════════════════════════════════════════════════════════
-- Existing schema has employee_name + employee_email but no FK. The
-- new public flow knows exactly which employee submitted, so attach
-- the FK so the denial-note flow can write to employee_notes with the
-- correct related employee_id.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE absence_records
  ADD COLUMN IF NOT EXISTS employee_id UUID REFERENCES employee_records(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_absence_records_employee ON absence_records (employee_id);


-- ════════════════════════════════════════════════════════════════
-- 2. employee_notes (new table)
-- ════════════════════════════════════════════════════════════════
-- One row per note. Denial-reason notes are written by the public-flow
-- portal endpoint with note_type='leave_denied' and related_id pointing
-- at the absence_records row that triggered the note.
-- ════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS employee_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employee_records(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  author_id   UUID REFERENCES profiles(id),
  note_type   TEXT NOT NULL DEFAULT 'general'
                CHECK (note_type IN ('general', 'leave_denied', 'absence', 'performance', 'disciplinary')),
  body        TEXT NOT NULL,
  related_id  UUID,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_employee_notes_employee ON employee_notes (employee_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_employee_notes_company  ON employee_notes (company_id);


-- ════════════════════════════════════════════════════════════════
-- 3. RLS on employee_notes
-- ════════════════════════════════════════════════════════════════
-- Company-scoped read/write for portal users; staff full access.
-- DELETE gated to Admin (super user) per the role split from
-- migration 045.
-- ════════════════════════════════════════════════════════════════

ALTER TABLE employee_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "employee_notes_client_select" ON employee_notes;
CREATE POLICY "employee_notes_client_select" ON employee_notes FOR SELECT
  TO authenticated
  USING (company_id = (SELECT my_company_id()) OR (SELECT is_tps_staff()));

DROP POLICY IF EXISTS "employee_notes_client_insert" ON employee_notes;
CREATE POLICY "employee_notes_client_insert" ON employee_notes FOR INSERT
  TO authenticated
  WITH CHECK (company_id = (SELECT my_company_id()) OR (SELECT is_tps_staff()));

DROP POLICY IF EXISTS "employee_notes_client_update" ON employee_notes;
CREATE POLICY "employee_notes_client_update" ON employee_notes FOR UPDATE
  TO authenticated
  USING (company_id = (SELECT my_company_id()))
  WITH CHECK (company_id = (SELECT my_company_id()));

DROP POLICY IF EXISTS "employee_notes_admin_delete" ON employee_notes;
CREATE POLICY "employee_notes_admin_delete" ON employee_notes FOR DELETE
  TO authenticated
  USING (
    company_id = (SELECT my_company_id())
    AND (SELECT is_company_super_user())
  );

DROP POLICY IF EXISTS "employee_notes_staff_all" ON employee_notes;
CREATE POLICY "employee_notes_staff_all" ON employee_notes FOR ALL
  TO authenticated
  USING ((SELECT is_tps_staff()))
  WITH CHECK ((SELECT is_tps_staff()));


-- ════════════════════════════════════════════════════════════════
-- 4. Verification (read-only)
-- ════════════════════════════════════════════════════════════════

SELECT
  EXISTS(SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='employee_records'
            AND column_name='leave_token') AS leave_token_column_exists,
  EXISTS(SELECT 1 FROM pg_class
          WHERE relname='employee_notes' AND relkind='r')           AS employee_notes_table_exists,
  (SELECT COUNT(*) FROM employee_records WHERE leave_token IS NOT NULL) AS tokenised_employees,
  (SELECT COUNT(*) FROM employee_records WHERE leave_token IS NULL)     AS missing_tokens;
