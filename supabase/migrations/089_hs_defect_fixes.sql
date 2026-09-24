-- ═══════════════════════════════════════════════════════════════════
-- 089: defects in the modules Health & Safety builds on (2026-09-24)
-- ═══════════════════════════════════════════════════════════════════
--
-- Found during H&S discovery, verified live. Every affected table was
-- empty when this was written (documents, reports, compliance_items,
-- employee_documents: 0 rows; documents bucket: 0 objects), which is
-- the only reason none of these had been reported: each one fails the
-- first time anybody uses the feature.
--
--   1. Storage: "Authenticated upload to documents bucket" let ANY
--      signed-in user write anywhere in the bucket outside athletes/,
--      including another client's <company_id>/ folder.
--   2. Storage: clients could not read their own reports. Reports are
--      stored at reports/<company_id>/…, but client_read_storage only
--      matched a first folder equal to the company id.
--   3. documents.file_url and reports.file_url were NOT NULL, while every
--      upload path now writes only the storage key (file_path /
--      storage_path) because both buckets are private and a public URL
--      never resolved. So every file upload uploaded the object and then
--      failed the row insert with 23502, orphaning the file.
--   4. documents had no client INSERT policy, so the portal's
--      DocumentUpload failed the row insert for every client too.
--   5. compliance_items.notes is selected by the portal register page
--      and the admin client tab; the column did not exist, so both
--      queries errored and both lists were always empty.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

-- ── 1. documents bucket: a client writes only into its own folder ───
DROP POLICY IF EXISTS "Authenticated upload to documents bucket" ON storage.objects;
DROP POLICY IF EXISTS documents_client_insert_own_folder ON storage.objects;
CREATE POLICY documents_client_insert_own_folder ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = (SELECT public.my_company_id())::text
  );
-- Staff keep tps_write_storage (documents/reports/cvs, is_tps_staff()).

-- ── 2. clients read their own reports/<company_id>/ folder ──────────
DROP POLICY IF EXISTS documents_client_read_reports ON storage.objects;
CREATE POLICY documents_client_read_reports ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND (storage.foldername(name))[1] = 'reports'
    AND (storage.foldername(name))[2] = (SELECT public.my_company_id())::text
  );

-- ── 3. a stored file needs a key, not a public URL ──────────────────
ALTER TABLE public.documents ALTER COLUMN file_url DROP NOT NULL;
ALTER TABLE public.documents DROP CONSTRAINT IF EXISTS documents_file_ref_present;
ALTER TABLE public.documents ADD CONSTRAINT documents_file_ref_present
  CHECK (nullif(file_url, '') IS NOT NULL OR nullif(file_path, '') IS NOT NULL);

ALTER TABLE public.reports ALTER COLUMN file_url DROP NOT NULL;
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_file_ref_present;
ALTER TABLE public.reports ADD CONSTRAINT reports_file_ref_present
  CHECK (nullif(file_url, '') IS NOT NULL OR nullif(storage_path, '') IS NOT NULL);

-- ── 4. clients may add documents to their own company ───────────────
DROP POLICY IF EXISTS client_documents_insert ON public.documents;
CREATE POLICY client_documents_insert ON public.documents
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT public.my_company_id())
    AND uploaded_by = (SELECT auth.uid())
    -- the stored file must be in the caller's own company folder
    AND (file_path IS NULL OR split_part(file_path, '/', 1) = company_id::text)
    -- a client cannot add a document that is already signed off
    AND approved_at IS NULL
    AND approved_by IS NULL
  );

-- ── 5. the column two screens already read ──────────────────────────
ALTER TABLE public.compliance_items ADD COLUMN IF NOT EXISTS notes text;
