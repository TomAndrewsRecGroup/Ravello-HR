-- ═══════════════════════════════════════════════════════════
-- Phase 59: Logos for clients, partners, training providers
--
-- Adds logo_url to companies, partners and training_providers and
-- creates a public 'logos' storage bucket with RLS that lets TPS
-- staff upload/replace and lets everyone read (public bucket).
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

-- ── Schema columns ─────────────────────────────────────────
ALTER TABLE companies           ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE partners            ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE training_providers  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- ── Storage bucket ─────────────────────────────────────────
-- Public so we can render logos on every page without signed URLs.
-- 2 MB cap, image MIME types only, enforced at the storage layer.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'logos',
  'logos',
  true,
  2 * 1024 * 1024,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Storage policies ───────────────────────────────────────
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT polname FROM pg_policy
     WHERE polname LIKE 'logos_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.polname);
  END LOOP;
END $$;

-- Anyone (anon + authenticated) can read.
CREATE POLICY logos_public_read ON storage.objects FOR SELECT
  USING (bucket_id = 'logos');

-- Only TPS staff can write / replace / delete.
CREATE POLICY logos_staff_insert ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'logos' AND public.is_tps_staff());

CREATE POLICY logos_staff_update ON storage.objects FOR UPDATE
  TO authenticated
  USING      (bucket_id = 'logos' AND public.is_tps_staff())
  WITH CHECK (bucket_id = 'logos' AND public.is_tps_staff());

CREATE POLICY logos_staff_delete ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'logos' AND public.is_tps_staff());
