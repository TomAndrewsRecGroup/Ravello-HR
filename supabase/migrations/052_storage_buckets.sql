-- ════════════════════════════════════════════════════════════════════════
-- Migration 052: Storage buckets for documents / reports / CVs
-- ────────────────────────────────────────────────────────────────────────
-- User reported "Bucket not found" on:
--   • CSV Exports → Add report → Upload file
--   • Documents → Upload Document
-- The application code expects three buckets to exist:
--
--   documents     — client-shared docs (contracts, policies, handbooks)
--   reports       — generated CSV / value reports admin uploads for clients
--   cvs           — candidate CV uploads from the hire pipeline
--
-- This migration creates them idempotently with appropriate RLS so:
--   • TPS staff (is_tps_staff()) can read + write everything
--   • Authenticated client users can read their own company's files
--     (path convention: <bucket>/<company_id>/<filename>)
--   • Anonymous users can do nothing
--
-- Idempotent. Safe to re-run.
-- ════════════════════════════════════════════════════════════════════════

-- Create buckets via the storage API. INSERT … ON CONFLICT DO NOTHING
-- keeps this safe to re-run.
INSERT INTO storage.buckets (id, name, public)
VALUES
  ('documents', 'documents', false),
  ('reports',   'reports',   false),
  ('cvs',       'cvs',       false)
ON CONFLICT (id) DO NOTHING;

-- ── Policies ──────────────────────────────────────────────────────────
-- Drop any prior policies on these buckets first so re-running the
-- migration doesn't pile up duplicates with slightly different
-- definitions across versions.

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT polname FROM pg_policy
     WHERE polname LIKE 'tps_%_storage'
        OR polname LIKE 'client_%_storage'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.polname);
  END LOOP;
END $$;

-- TPS staff: full read + write on all three buckets.
CREATE POLICY tps_read_storage ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id IN ('documents', 'reports', 'cvs') AND public.is_tps_staff()
  );

CREATE POLICY tps_write_storage ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id IN ('documents', 'reports', 'cvs') AND public.is_tps_staff()
  );

CREATE POLICY tps_update_storage ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id IN ('documents', 'reports', 'cvs') AND public.is_tps_staff()
  );

CREATE POLICY tps_delete_storage ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id IN ('documents', 'reports', 'cvs') AND public.is_tps_staff()
  );

-- Client users: read access to files under their own company prefix.
-- Files must be saved with a path like "<company_id>/<filename>".
CREATE POLICY client_read_storage ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id IN ('documents', 'reports') AND
    (storage.foldername(name))[1] = public.my_company_id()::text
  );

-- Sanity check.
SELECT id, name, public FROM storage.buckets WHERE id IN ('documents', 'reports', 'cvs');
SELECT polname FROM pg_policy WHERE polname LIKE 'tps_%_storage' OR polname LIKE 'client_%_storage';
