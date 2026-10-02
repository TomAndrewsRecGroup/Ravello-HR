-- ═══════════════════════════════════════════════════════════════════
-- 204: requisition_stage_history — real stage-duration analytics
-- (go-live gap list, item 5, 2026-10-02)
-- ═══════════════════════════════════════════════════════════════════
--
-- requisitions.stage_changed_at (104) only ever holds ONE fact: when
-- the CURRENT stage began. It is overwritten on every move, so it has
-- never been possible to answer "how long did this role spend in
-- interview" after the fact — the hiring analytics page's own "Time
-- to Hire" metric is the only duration this codebase has ever
-- computed, and it spans the WHOLE pipeline, never a single stage.
--
-- This is an insert-only append log, extending the EXISTING
-- requisition_stage_stamp() trigger (104) rather than a parallel
-- mechanism — the same trigger that already stamps stage_changed_at
-- now also records the transition it just computed, so the two can
-- never drift apart (one function, one source of truth for "when did
-- this move happen").
--
-- Honestly scoped: history starts the day this migration applies.
-- The one-time backfill below inserts exactly ONE row per existing
-- requisition — its CURRENT stage, dated by the existing
-- stage_changed_at — so a role already in the pipeline has at least
-- one row to measure FROM, never a guessed prior transition that was
-- never actually recorded.

CREATE TABLE IF NOT EXISTS public.requisition_stage_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisition_id  uuid NOT NULL REFERENCES public.requisitions(id) ON DELETE CASCADE,
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  from_stage      text,
  to_stage        text NOT NULL,
  changed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS requisition_stage_history_req_idx
  ON public.requisition_stage_history (requisition_id, changed_at);
CREATE INDEX IF NOT EXISTS requisition_stage_history_company_idx
  ON public.requisition_stage_history (company_id, changed_at);

ALTER TABLE public.requisition_stage_history ENABLE ROW LEVEL SECURITY;

-- Staff-only, the same posture client_health_snapshots (107) already
-- takes for an internal recruiter-ops signal — a client already sees
-- their own requisitions' CURRENT stage on the live /hiring page; a
-- stage-by-stage duration breakdown is an internal recruiter metric,
-- not a commitment made to the client about how long each step takes.
DROP POLICY IF EXISTS requisition_stage_history_staff_all ON public.requisition_stage_history;
CREATE POLICY requisition_stage_history_staff_all ON public.requisition_stage_history FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

-- Insert-only for everyone, staff included — a correction is a new
-- transition row, never an edit of history that already happened.
REVOKE UPDATE, DELETE, TRUNCATE ON public.requisition_stage_history FROM PUBLIC, anon, authenticated;

-- ── Extend the EXISTING trigger function, re-created in place ───────
CREATE OR REPLACE FUNCTION public.requisition_stage_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.stage_changed_at := coalesce(NEW.stage_changed_at, now());
    IF NEW.stage = 'filled' THEN NEW.filled_at := coalesce(NEW.filled_at, now()); END IF;
    INSERT INTO public.requisition_stage_history (requisition_id, company_id, from_stage, to_stage, changed_at)
    VALUES (NEW.id, NEW.company_id, NULL, NEW.stage, NEW.stage_changed_at);
    RETURN NEW;
  END IF;
  IF NEW.stage IS DISTINCT FROM OLD.stage THEN
    NEW.stage_changed_at := now();
    IF NEW.stage = 'filled' THEN
      NEW.filled_at := coalesce(NEW.filled_at, now());
    END IF;
    INSERT INTO public.requisition_stage_history (requisition_id, company_id, from_stage, to_stage, changed_at)
    VALUES (NEW.id, NEW.company_id, OLD.stage, NEW.stage, NEW.stage_changed_at);
  END IF;
  RETURN NEW;
END;
$$;

-- The trigger itself (104) already points at this function by name —
-- no DROP/CREATE TRIGGER needed, CREATE OR REPLACE FUNCTION is enough.

-- One-time backfill: every existing requisition's CURRENT stage,
-- dated by the stage_changed_at it already has. ON CONFLICT is not
-- needed (no unique constraint — a second run would duplicate, so
-- this is guarded by NOT EXISTS instead, making a re-run of this
-- migration file a safe no-op).
INSERT INTO public.requisition_stage_history (requisition_id, company_id, from_stage, to_stage, changed_at)
SELECT r.id, r.company_id, NULL, r.stage, coalesce(r.stage_changed_at, r.created_at)
FROM public.requisitions r
WHERE NOT EXISTS (
  SELECT 1 FROM public.requisition_stage_history h WHERE h.requisition_id = r.id
);
