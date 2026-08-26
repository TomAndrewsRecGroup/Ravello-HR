-- ═══════════════════════════════════════════════════════════
-- Phase 77: Referral pipeline (Manatal → IvyLens → People System)
--
-- Roles posted through Manatal to the job boards collect applicants.
-- This pipeline reads those applicants hourly, gates them (country →
-- mandatory criteria → match score) and emails the ones that qualify
-- a partner's referral link.
--
-- Two tables:
--   referral_role_config  — per-requisition config. Its EXISTENCE is
--                           the "this is a referral role" flag, so a
--                           requisition with no row can never enter
--                           the funnel by accident.
--   referral_applications — one row per (candidate, role) journey.
--
-- Manatal is READ-ONLY to this pipeline. It is never written back to,
-- so there is exactly one writer for a candidate's funnel status and
-- no second vocabulary to keep in sync.
--
-- TPS staff only — no client portal exposure.
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

-- ─── Per-role configuration ────────────────────────────────

CREATE TABLE IF NOT EXISTS referral_role_config (
  requisition_id      UUID PRIMARY KEY REFERENCES requisitions(id) ON DELETE CASCADE,

  -- Kill switch. Disabling stops new applicants being picked up but
  -- leaves existing referral_applications rows intact.
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,

  -- Scores and records every applicant but sends NO email. Defaults
  -- to TRUE on purpose: the IvyLens partner scan endpoint returns a
  -- raw, uncalibrated AI score, so the thresholds below are starting
  -- guesses until a real distribution has been observed. A role goes
  -- live only by someone deliberately turning this off.
  dry_run             BOOLEAN NOT NULL DEFAULT TRUE,

  -- Who the candidate is being referred TO, e.g. 'Micro1'. Needed
  -- because the requisition's own company is Andrews Recruitment
  -- Group (the referrer), not the destination the email names.
  partner_name        TEXT NOT NULL,

  -- The partner's static application/referral link. No per-candidate
  -- tokenisation and no click tracking by design.
  referral_url        TEXT NOT NULL,

  -- Optional override for the one-line "what happens next" sentence in
  -- the invitation email. NULL uses the default wording.
  email_process_note  TEXT,

  auto_send_threshold INT NOT NULL DEFAULT 85,
  review_threshold    INT NOT NULL DEFAULT 75,

  -- Country eligibility, checked BEFORE any AI spend.
  --
  -- An EMPTY array means REFUSE EVERYONE, not allow everyone. This
  -- gate fails closed because the cost of getting it wrong is an
  -- email sent in the operator's name to someone who was never
  -- eligible. The admin UI refuses to enable a role with an empty
  -- list rather than letting it silently pass nobody.
  approved_countries  TEXT[] NOT NULL DEFAULT '{}',

  -- [{ key, label, match_terms: [] }]
  --
  -- A criterion passes ONLY on positive evidence in the scan's
  -- skill_matches[]. Absent, not-found, or low-confidence all FAIL.
  -- See admin/src/lib/referral/gate.ts — defaulting an unmentioned
  -- criterion to "pass" is the exact failure this exists to prevent
  -- (a candidate scoring 91% on adjacent experience while having
  -- never touched the mandatory skill).
  mandatory_criteria  JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT referral_role_config_thresholds_ordered
    CHECK (review_threshold <= auto_send_threshold),
  CONSTRAINT referral_role_config_thresholds_ranged
    CHECK (auto_send_threshold BETWEEN 0 AND 100
       AND review_threshold    BETWEEN 0 AND 100)
);

-- ─── Per-applicant journey ─────────────────────────────────

CREATE TABLE IF NOT EXISTS referral_applications (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id         UUID NOT NULL REFERENCES candidates(id)    ON DELETE CASCADE,
  requisition_id       UUID NOT NULL REFERENCES requisitions(id)  ON DELETE CASCADE,
  company_id           UUID          REFERENCES companies(id)     ON DELETE SET NULL,

  -- Manatal ids are integers upstream; stored TEXT to match the
  -- existing companies.manatal_client_id / requisitions.manatal_job_id
  -- convention.
  manatal_candidate_id TEXT NOT NULL,
  manatal_match_id     TEXT,

  -- TEXT + CHECK rather than a PG enum. This repo already carries a
  -- live enum-drift bug (the All Candidates page writes a
  -- candidate_client_status value that was never added to the type),
  -- and the downstream stages below will grow as the partner reports
  -- more back. A CHECK is altered in one statement.
  status               TEXT NOT NULL DEFAULT 'review_pending'
    CHECK (status IN (
      -- gated out
      'rejected_country', 'rejected_criteria', 'rejected_score',
      -- in flight
      'review_pending', 'review_rejected', 'qualified', 'email_sent',
      -- downstream, advanced by hand from the admin UI
      'applied_to_partner', 'ai_interview', 'accepted',
      'ten_hours_completed', 'fee_due', 'paid',
      -- fault
      'scan_error'
    )),

  -- 0-100. NULL when the candidate was gated out before scoring —
  -- which is the normal, cheap path for an ineligible country.
  match_score          INT CHECK (match_score BETWEEN 0 AND 100),

  -- Which text was actually scored. Surfaced in the UI so a thin
  -- scan is visibly thin: Manatal's resume link is a presigned URL
  -- with a ~1 hour TTL, and an expired fetch that silently fell back
  -- would otherwise be indistinguishable from a weak candidate.
  scan_source          TEXT CHECK (scan_source IN ('cv_pdf', 'manatal_parsed')),

  country_detected     TEXT,
  country_gate_result  TEXT CHECK (country_gate_result IN ('approved', 'rejected', 'unknown')),

  failed_criteria      JSONB NOT NULL DEFAULT '[]'::jsonb,
  matched_skills       JSONB NOT NULL DEFAULT '[]'::jsonb,
  strengths            JSONB NOT NULL DEFAULT '[]'::jsonb,
  gaps                 JSONB NOT NULL DEFAULT '[]'::jsonb,

  ivylens_scan_id      TEXT,
  scan_error           TEXT,

  scanned_at           TIMESTAMPTZ,
  email_sent_at        TIMESTAMPTZ,
  email_provider_id    TEXT,
  reviewed_by          UUID REFERENCES profiles(id) ON DELETE SET NULL,
  reviewed_at          TIMESTAMPTZ,

  -- Append-only [{ at, from, to, by }].
  status_history       JSONB NOT NULL DEFAULT '[]'::jsonb,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- The idempotency guard, and the reason the cron can never email
  -- anyone twice: the row's existence means this person has already
  -- been considered for this role.
  CONSTRAINT referral_applications_unique_per_role
    UNIQUE (manatal_candidate_id, requisition_id)
);

CREATE INDEX IF NOT EXISTS referral_applications_status_idx
  ON referral_applications(status, created_at DESC);
CREATE INDEX IF NOT EXISTS referral_applications_req_status_idx
  ON referral_applications(requisition_id, status);
CREATE INDEX IF NOT EXISTS referral_applications_created_idx
  ON referral_applications(created_at DESC);
CREATE INDEX IF NOT EXISTS referral_applications_candidate_idx
  ON referral_applications(candidate_id);

-- ─── updated_at maintenance ────────────────────────────────

CREATE OR REPLACE FUNCTION public.touch_referral_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS referral_role_config_touch ON referral_role_config;
CREATE TRIGGER referral_role_config_touch
  BEFORE UPDATE ON referral_role_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_referral_updated_at();

DROP TRIGGER IF EXISTS referral_applications_touch ON referral_applications;
CREATE TRIGGER referral_applications_touch
  BEFORE UPDATE ON referral_applications
  FOR EACH ROW EXECUTE FUNCTION public.touch_referral_updated_at();

-- ─── RLS: TPS staff only ───────────────────────────────────
-- Mirrors migration 074 (email_log). The hourly cron uses the
-- service role, which bypasses RLS entirely.

ALTER TABLE referral_role_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_applications ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT polname, polrelid::regclass AS tbl
    FROM pg_policy
    WHERE polname LIKE 'referral_role_config_%'
       OR polname LIKE 'referral_applications_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %s', pol.polname, pol.tbl);
  END LOOP;
END $$;

CREATE POLICY referral_role_config_staff_all ON referral_role_config
  FOR ALL TO authenticated
  USING      ((SELECT public.is_tps_staff()))
  WITH CHECK ((SELECT public.is_tps_staff()));

CREATE POLICY referral_applications_staff_all ON referral_applications
  FOR ALL TO authenticated
  USING      ((SELECT public.is_tps_staff()))
  WITH CHECK ((SELECT public.is_tps_staff()));
