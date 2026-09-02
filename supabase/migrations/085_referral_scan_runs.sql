-- One row per referral-scan cron invocation.
--
-- The pipeline produced ZERO applications for four consecutive hours
-- with a role that had 69 job-board applicants, a filled-in config and
-- dry run on. Nothing anywhere recorded whether the cron had fired, so
-- "it ran and found nothing" and "it never ran" were indistinguishable
-- — and the route's own tally went to a console log nobody can query.
--
-- A cron FIRING and a cron WORKING are different facts. This is the
-- table that knows which happened.
--
-- `outcome` is the coarse verdict: 'ok' | 'degraded' | 'no_roles' |
-- 'unauthorized' | 'error'. `unauthorized` is recorded ONLY when
-- CRON_SECRET is unset on the environment, which is a misconfiguration
-- rather than a caller — logging arbitrary 401s would let anyone fill
-- the table.

CREATE TABLE IF NOT EXISTS public.referral_scan_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at       timestamptz NOT NULL DEFAULT now(),
  duration_ms  integer,
  ok           boolean NOT NULL,
  outcome      text NOT NULL,
  roles_considered integer NOT NULL DEFAULT 0,
  roles_skipped    integer NOT NULL DEFAULT 0,
  matches_seen     integer NOT NULL DEFAULT 0,
  scanned          integer NOT NULL DEFAULT 0,
  emailed          integer NOT NULL DEFAULT 0,
  -- The whole tally, so a skip reason added later is captured without
  -- a migration. Every skip reason is counted — "0 emailed" with no
  -- breakdown is the state somebody would otherwise debug from scratch.
  tally        jsonb,
  notes        text[]
);

CREATE INDEX IF NOT EXISTS idx_referral_scan_runs_ran_at
  ON public.referral_scan_runs (ran_at DESC);

ALTER TABLE public.referral_scan_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS referral_scan_runs_staff_read ON public.referral_scan_runs;
CREATE POLICY referral_scan_runs_staff_read
  ON public.referral_scan_runs FOR SELECT
  USING (public.is_tps_staff());

COMMENT ON TABLE public.referral_scan_runs IS
  'One row per referral-scan cron invocation. Exists because the cron produced zero applications for four hours and nothing recorded whether it had run at all — a cron FIRING and a cron WORKING are different facts.';
