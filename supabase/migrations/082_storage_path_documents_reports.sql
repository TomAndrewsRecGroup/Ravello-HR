-- ═══════════════════════════════════════════════════════════
-- Phase 82: reference stored files by PATH, not by a public URL
--
-- Four sites wrote `getPublicUrl()` against the `documents` bucket.
-- That bucket is PRIVATE (`public = false`), and Supabase's public
-- object endpoint serves public buckets only — so every one of those
-- URLs is dead on arrival.
--
-- This is not new: migration 068 moved athlete CVs off exactly this
-- pattern, and its own header records the symptom — "returned 'Bucket
-- not found'". `employee_documents.file_storage_path` followed in 062.
-- `documents` and `reports` were simply never brought across.
--
-- Latent rather than live: documents, reports and employee_documents
-- are all empty today, and the documents bucket holds no objects. The
-- first real upload would have produced an unopenable link.
--
-- `file_url` is KEPT and stays nullable. It legitimately holds an
-- operator-pasted external link (Drive, YouTube, Vercel blob) on some
-- rows, so it cannot be dropped or backfilled — the reader picks:
-- storage_path wins when present, file_url is the fallback.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

-- `documents` needs NOTHING: it already has `file_path`, already written by
-- the portal's DocumentUpload. Only `reports` was missing a path column.
--
-- Three tables, three names for one concept — documents.file_path,
-- reports.storage_path, employee_documents.file_storage_path (mig 062).
-- Ugly, and deliberately not unified: renaming a column that already has a
-- live writer to make a set look tidy is a migration with real risk and no
-- user-visible gain. `lib/storage/fileKinds.ts` is the one place that has
-- to know, and it names the column per table for exactly this reason.

ALTER TABLE reports ADD COLUMN IF NOT EXISTS storage_path TEXT;

COMMENT ON COLUMN reports.storage_path IS
  'Key within the private `documents` bucket. Canonical reference — sign on demand via /api/files/sign. file_url is legacy/external-link only.';

CREATE INDEX IF NOT EXISTS reports_storage_path_idx ON reports (storage_path) WHERE storage_path IS NOT NULL;
