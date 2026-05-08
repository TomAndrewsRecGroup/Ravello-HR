-- ═══════════════════════════════════════════════════════════
-- Phase 68: Private athlete-cvs storage bucket
--
-- Athlete CVs contain personal data and must be locked down.
-- Up to phase 67 they were uploaded into the shared 'documents'
-- bucket via getPublicUrl() — which (a) leaked the file behind
-- any URL guesser if the bucket was public, and (b) returned
-- "Bucket not found" if the bucket had not been created on the
-- target project.
--
-- This migration creates a dedicated PRIVATE bucket and writes
-- RLS so:
--   • TPS staff (is_tps_staff()) can read + write everything.
--   • Authenticated client users can SELECT only their own
--     company's prefix (path: <company_id>/<athlete_id>/<file>).
--   • Public/anonymous access is denied entirely.
--   • All file fetches must go through createSignedUrl() — so
--     PII is never exposed via a stable public URL.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'athlete-cvs',
  'athlete-cvs',
  false,
  10 * 1024 * 1024,
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Drop any prior policies on this bucket first so re-running
-- doesn't pile up duplicate rules.
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT polname FROM pg_policy
     WHERE polname LIKE 'athlete_cvs_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.polname);
  END LOOP;
END $$;

-- TPS staff: full access.
CREATE POLICY athlete_cvs_staff_select ON storage.objects FOR SELECT
  TO authenticated
  USING      (bucket_id = 'athlete-cvs' AND public.is_tps_staff());

CREATE POLICY athlete_cvs_staff_insert ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'athlete-cvs' AND public.is_tps_staff());

CREATE POLICY athlete_cvs_staff_update ON storage.objects FOR UPDATE
  TO authenticated
  USING      (bucket_id = 'athlete-cvs' AND public.is_tps_staff())
  WITH CHECK (bucket_id = 'athlete-cvs' AND public.is_tps_staff());

CREATE POLICY athlete_cvs_staff_delete ON storage.objects FOR DELETE
  TO authenticated
  USING      (bucket_id = 'athlete-cvs' AND public.is_tps_staff());

-- Client users: read + write only under their own company prefix.
-- Path convention: <company_id>/<athlete_id>/<filename>.
CREATE POLICY athlete_cvs_client_select ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'athlete-cvs'
    AND (storage.foldername(name))[1] = public.my_company_id()::text
  );

CREATE POLICY athlete_cvs_client_insert ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'athlete-cvs'
    AND (storage.foldername(name))[1] = public.my_company_id()::text
  );

CREATE POLICY athlete_cvs_client_update ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'athlete-cvs'
    AND (storage.foldername(name))[1] = public.my_company_id()::text
  )
  WITH CHECK (
    bucket_id = 'athlete-cvs'
    AND (storage.foldername(name))[1] = public.my_company_id()::text
  );

CREATE POLICY athlete_cvs_client_delete ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'athlete-cvs'
    AND (storage.foldername(name))[1] = public.my_company_id()::text
  );
