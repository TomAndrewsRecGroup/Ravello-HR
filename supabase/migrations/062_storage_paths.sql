-- ═══════════════════════════════════════════════════════════
-- Phase 62: Storage paths alongside public-URL columns
--
-- Stops persisting a public-style URL (storage.getPublicUrl()) as
-- the canonical reference. The URL works only while the bucket is
-- private + the caller is authenticated, and if the bucket is ever
-- flipped public every CV / employee doc would be browsable
-- without auth. Storing the path lets future readers mint short-
-- lived signed URLs on demand instead.
--
-- Old rows keep their cv_url / file_url for backward compat. New
-- rows populate both fields; once readers are migrated to the
-- signed-on-demand path we can drop the URL columns.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS cv_storage_path TEXT;

ALTER TABLE employee_documents
  ADD COLUMN IF NOT EXISTS file_storage_path TEXT;

COMMENT ON COLUMN athletes.cv_storage_path IS
  'Storage path under the documents bucket. Use lib/storage/files.ts > signFileUrl() to mint a short-lived URL on demand. cv_url is retained for backward compat and will be removed once readers are migrated.';

COMMENT ON COLUMN employee_documents.file_storage_path IS
  'Storage path under the documents bucket. Use lib/storage/files.ts > signFileUrl() to mint a short-lived URL on demand. file_url is retained for backward compat and will be removed once readers are migrated.';
