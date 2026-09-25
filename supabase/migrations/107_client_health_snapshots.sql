-- ═══════════════════════════════════════════════════════════════════
-- 107: client health snapshots — trends and churn early-warning
-- ═══════════════════════════════════════════════════════════════════
--
-- The HIRE "later" item from the connective-tissue automation plan:
-- /health and /engagement have always computed a live band/score from
-- CURRENT state only — there was never anywhere to see whether a
-- client is getting better or worse. This is a daily append-only
-- snapshot, written once a day by the health-snapshot cron (service
-- role), read by staff to show a trend and flag a declining client
-- before it becomes a lost account.
--
-- Staff-only: this is an internal BD/account-management signal, never
-- shown to a client — the same posture sector packs (106) take for
-- staff reference data.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.client_health_snapshots (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  snapshot_date     date NOT NULL,
  band              text NOT NULL CHECK (band IN ('green', 'amber', 'red')),
  engagement_score  integer NOT NULL CHECK (engagement_score BETWEEN 0 AND 100),
  overdue_comp      integer NOT NULL DEFAULT 0,
  open_tickets      integer NOT NULL DEFAULT 0,
  stalled_reqs      integer NOT NULL DEFAULT 0,
  days_since_login  integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS client_health_snapshots_company_idx ON public.client_health_snapshots (company_id, snapshot_date DESC);

ALTER TABLE public.client_health_snapshots ENABLE ROW LEVEL SECURITY;

-- Staff read-only from a session; the cron writes with the service
-- role, which bypasses RLS entirely, so there is deliberately no
-- INSERT/UPDATE policy for `authenticated` at all — nobody in a
-- browser session should ever be able to write a snapshot by hand.
DROP POLICY IF EXISTS client_health_snapshots_staff_read ON public.client_health_snapshots;
CREATE POLICY client_health_snapshots_staff_read ON public.client_health_snapshots FOR SELECT TO authenticated
  USING ((SELECT public.is_tps_staff()));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.client_health_snapshots FROM PUBLIC, anon, authenticated;
