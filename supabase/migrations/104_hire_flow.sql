-- ═══════════════════════════════════════════════════════════
-- 104: HIRE in sync
-- ═══════════════════════════════════════════════════════════
-- Additive; apply BEFORE the HIRE PR code deploys (after 104a).
--
-- Staff moving a role, sharing a candidate, booking an interview or
-- sending an offer told the client nothing; a role could sit untouched
-- for a month and an offer past its deadline with nobody nagged; the
-- referral cron could fail every hour in silence. This migration gives
-- the outbox the two tables it was missing, stamps the dates the
-- reminders and time-to-hire need, and gives the consumer an idempotent
-- key on the client calendar.

-- ── requisitions: when the stage last moved, and when it was filled ──
-- stage_changed_at drives the stale-role reminder (14 days without
-- movement); filled_at makes time-to-hire a subtraction instead of a
-- guess. Both are set by a BEFORE trigger, so every writer (admin
-- panel, portal, the hire consumer, the SQL editor) stamps them alike.

ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS stage_changed_at timestamptz;
ALTER TABLE public.requisitions ADD COLUMN IF NOT EXISTS filled_at        timestamptz;

CREATE OR REPLACE FUNCTION public.requisition_stage_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stage_changed_at := coalesce(NEW.stage_changed_at, now());
    IF NEW.stage = 'filled' THEN NEW.filled_at := coalesce(NEW.filled_at, now()); END IF;
    RETURN NEW;
  END IF;
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_changed_at := now();
    IF NEW.stage = 'filled' THEN
      NEW.filled_at := coalesce(NEW.filled_at, now());
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS requisitions_stage_stamp ON public.requisitions;
CREATE TRIGGER requisitions_stage_stamp BEFORE INSERT OR UPDATE ON public.requisitions
  FOR EACH ROW EXECUTE FUNCTION public.requisition_stage_stamp();

-- Backfill: the best evidence of the last move is updated_at; a role
-- already filled is treated as filled then. Neither is precise, and
-- the stale-role reminder tolerates that (it only ever costs a nag).
UPDATE public.requisitions SET stage_changed_at = coalesce(updated_at, created_at) WHERE stage_changed_at IS NULL;
UPDATE public.requisitions SET filled_at = coalesce(updated_at, created_at) WHERE stage = 'filled' AND filled_at IS NULL;

CREATE INDEX IF NOT EXISTS requisitions_stage_changed_idx ON public.requisitions (stage, stage_changed_at);

-- ── candidates: Jev's read of a client's rejection feedback ──────
-- A recommendation for the recruiter (reason, whether it is
-- actionable), never a status. client_feedback itself stays out of the
-- outbox whitelist; the consumer reads it from the row.
ALTER TABLE public.candidates ADD COLUMN IF NOT EXISTS feedback_triage jsonb;

-- ── company_calendar_events: idempotent rows written by the consumer ─
ALTER TABLE public.company_calendar_events ADD COLUMN IF NOT EXISTS source_ref text;
CREATE UNIQUE INDEX IF NOT EXISTS company_calendar_events_source_ref_idx
  ON public.company_calendar_events (company_id, source_ref) WHERE source_ref IS NOT NULL;

-- ── outbox: two tables the rules need ────────────────────────────
-- interview_schedules: never feedback_notes or client_feedback.
DROP TRIGGER IF EXISTS interview_schedules_platform_event ON public.interview_schedules;
CREATE TRIGGER interview_schedules_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.interview_schedules
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','outcome','candidate_id','requisition_id','scheduled_at','duration_mins','stage_number','stage_label','interview_type');

-- referral_scan_runs has no company_id (the cron runs across roles);
-- platform_event_row records the event with company NULL, which is
-- what a staff-only alert wants. The tally is not whitelisted: counts
-- only.
DROP TRIGGER IF EXISTS referral_scan_runs_platform_event ON public.referral_scan_runs;
CREATE TRIGGER referral_scan_runs_platform_event AFTER INSERT ON public.referral_scan_runs
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('ok','outcome','roles_considered','scanned','emailed','duration_ms');

-- offers: the consumer reads start_date for the client's offer note.
DROP TRIGGER IF EXISTS offers_platform_event ON public.offers;
CREATE TRIGGER offers_platform_event AFTER INSERT OR UPDATE OR DELETE ON public.offers
  FOR EACH ROW EXECUTE FUNCTION public.platform_event_row('status','candidate_id','requisition_id','deadline','start_date');

COMMENT ON COLUMN public.requisitions.stage_changed_at IS 'Set by requisition_stage_stamp whenever stage changes (104). Drives the stale-role reminder.';
COMMENT ON COLUMN public.requisitions.filled_at IS 'First time stage became filled (104). Time to hire = filled_at - created_at.';
COMMENT ON COLUMN public.candidates.feedback_triage IS 'Jev candidate_feedback_reason: a recommendation for the recruiter, never a status (104).';
