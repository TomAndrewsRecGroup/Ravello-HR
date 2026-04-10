-- ═══════════════════════════════════════════════════════════
-- Sprint 2: Schema integrity fixes
-- DB-001, DB-009, DB-010, DB-011, DB-012, DB-013, DB-014
-- ═══════════════════════════════════════════════════════════

-- ── DB-001: Add missing 'client_viewer' to user_role enum ──
-- Code references this role in invite, user management, and client listing
-- but it was never added to the enum type.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'client_viewer';

-- ── DB-009: Add missing composite indexes on frequently queried columns ──
-- learning_purchases: queried by (company_id, status) in dashboard + metrics
CREATE INDEX IF NOT EXISTS idx_learning_purchases_company_status
  ON learning_purchases(company_id, status);

-- notifications: queried by company_id for admin dashboards
CREATE INDEX IF NOT EXISTS idx_notifications_company
  ON notifications(company_id);

-- internal_tasks: queried by (assigned_to, status) for task boards
CREATE INDEX IF NOT EXISTS idx_internal_tasks_assigned_status
  ON internal_tasks(assigned_to, status);

-- absence_records: queried by (company_id, status) in protect dashboards
CREATE INDEX IF NOT EXISTS idx_absence_records_company_status
  ON absence_records(company_id, status);

-- employee_documents: queried by (company_id, expiry_date) for alerts
CREATE INDEX IF NOT EXISTS idx_emp_docs_company_expiry
  ON employee_documents(company_id, expiry_date);

-- ── DB-010: Fix overly permissive notification INSERT policy ──
-- Old policy: any authenticated user can insert notifications for any user.
-- New policy: only allow inserting notifications for yourself OR for users
-- in a company you belong to (for system-generated cross-user notifications).
DROP POLICY IF EXISTS "Authenticated users can insert notifications" ON notifications;

CREATE POLICY "Users can insert notifications for own company"
  ON notifications FOR INSERT
  WITH CHECK (
    -- System/self notifications
    user_id = auth.uid()
    OR
    -- TPO staff can notify any user
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
      AND role IN ('tps_admin', 'tps_client')
    )
    OR
    -- Same-company notifications (e.g. ticket replies)
    company_id IN (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
  );

-- ── DB-011: Soft-delete support for companies ──
-- Rather than changing CASCADE to RESTRICT (which would break existing flows),
-- add soft-delete column so companies can be archived instead of deleted.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- Index for active companies query
CREATE INDEX IF NOT EXISTS idx_companies_active
  ON companies(active) WHERE deleted_at IS NULL;

-- ── DB-012: Storage bucket creation ──
-- Create the documents bucket if it doesn't exist.
-- Note: Supabase storage buckets are created via the storage schema.
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', true)
ON CONFLICT (id) DO NOTHING;

-- Set a permissive policy for authenticated users to upload
-- (RLS on the application tables handles authorization)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Authenticated users can upload documents'
  ) THEN
    CREATE POLICY "Authenticated users can upload documents"
      ON storage.objects FOR INSERT
      WITH CHECK (bucket_id = 'documents' AND auth.uid() IS NOT NULL);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects' AND policyname = 'Public read access for documents'
  ) THEN
    CREATE POLICY "Public read access for documents"
      ON storage.objects FOR SELECT
      USING (bucket_id = 'documents');
  END IF;
END $$;

-- ── DB-013: Create enum types for commonly used status/priority fields ──
-- Standardize CHECK constraints to proper enums where it improves clarity.

-- Training needs priority (currently CHECK constraint)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'training_priority') THEN
    CREATE TYPE training_priority AS ENUM ('low', 'medium', 'high', 'critical');
  END IF;
END $$;

-- Absence status (currently CHECK constraint)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'absence_status') THEN
    CREATE TYPE absence_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
  END IF;
END $$;

-- ── DB-014: Add missing NOT NULL + defaults on template tables ──
-- Backfill any existing NULLs before applying NOT NULL constraint
UPDATE onboarding_templates SET is_default = false WHERE is_default IS NULL;
UPDATE offboarding_templates SET is_default = false WHERE is_default IS NULL;

ALTER TABLE onboarding_templates
  ALTER COLUMN is_default SET NOT NULL,
  ALTER COLUMN is_default SET DEFAULT false;

ALTER TABLE offboarding_templates
  ALTER COLUMN is_default SET NOT NULL,
  ALTER COLUMN is_default SET DEFAULT false;
