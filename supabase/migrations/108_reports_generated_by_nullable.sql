-- ═══════════════════════════════════════════════════════════════════
-- 108: reports.generated_by becomes nullable (2026-09-25)
-- ═══════════════════════════════════════════════════════════════════
--
-- The monthly value-report auto-generation cron writes reports with no
-- human in the loop — generated_by NOT NULL REFERENCES auth.users(id)
-- has no honest value for a system-generated row (there is no service-
-- role "user" in auth.users to point it at). Same reasoning as every
-- other *_by / recorded_by column in this schema that already allows
-- NULL for a system actor (hs_register_completions.recorded_by,
-- documents.approved_by, ...). Human-uploaded reports (ReportUploadForm)
-- are unaffected — they still stamp the uploader's own auth.uid().
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE public.reports ALTER COLUMN generated_by DROP NOT NULL;
