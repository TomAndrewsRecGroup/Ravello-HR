-- ═══════════════════════════════════════════════════════════
-- Phase 81: staged email attachments
--
-- The email composer used to POST its attachments through the Next
-- route as multipart. Vercel rejects a request body over 4.5 MB at the
-- EDGE — before the handler runs, with a bare 413 and no JSON body — so
-- the route's 25 MB ceiling was never reachable and a 5.7 MB file
-- surfaced to the operator as "Send failed (413)" with no explanation.
--
-- The file now goes BROWSER → STORAGE directly, which never touches a
-- Vercel function and so has no such limit. The route receives a path
-- and fetches the object server-side.
--
-- A DEDICATED bucket, not a folder inside `documents`. `documents`
-- carries `client_read_storage`, which lets a client read anything
-- under their own company-id prefix — so staging an email attachment
-- there would hand it to the very client it may be about. This bucket
-- has no client policy at all, by design.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('email-attachments', 'email-attachments', FALSE, 26214400)   -- 25 MB
ON CONFLICT (id) DO UPDATE
  SET public = FALSE, file_size_limit = 26214400;

-- Drop first so re-running cannot leave a superseded policy behind.
-- Postgres ORs permissive policies, so the weakest one on the table
-- decides; a leftover is the live grant, not dead code.
DROP POLICY IF EXISTS email_attachments_staff_insert ON storage.objects;
DROP POLICY IF EXISTS email_attachments_staff_select ON storage.objects;
DROP POLICY IF EXISTS email_attachments_staff_delete ON storage.objects;

-- Staff only, and scoped to the caller's OWN folder.
--
-- The path is `outbox/<auth.uid()>/<file>`, and the uid segment is
-- enforced here rather than only in the route. Without it any staff
-- member could stage a file into somebody else's folder, or read a
-- colleague's staged attachment by guessing a path.
CREATE POLICY email_attachments_staff_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'email-attachments'
    AND (SELECT public.is_tps_staff())
    AND (storage.foldername(name))[1] = 'outbox'
    AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  );

CREATE POLICY email_attachments_staff_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'email-attachments'
    AND (SELECT public.is_tps_staff())
    AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  );

CREATE POLICY email_attachments_staff_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'email-attachments'
    AND (SELECT public.is_tps_staff())
    AND (storage.foldername(name))[2] = (SELECT auth.uid())::text
  );
