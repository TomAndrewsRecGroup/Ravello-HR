-- Every publish attempt leaves a row, whatever happens.
--
-- The route already returns its reason to the panel, which renders it
-- in red under the button. That is enough for whoever is looking at the
-- screen at that moment and no use to anybody afterwards: the first
-- role published through this route failed twice with nobody able to
-- say WHY, because the only record of the failure was a piece of text
-- that had already gone.
--
-- A button being PRESSED and a job being UPDATED are different facts.
-- This is the table that knows the difference.
--
-- Note `is_tps_staff()`, not `is_ravello_staff()`. The latter does not
-- exist and never has, despite what the Phase 30 note claims — the
-- function list in pg_proc is the authority, and a policy naming a
-- missing function fails at CREATE, which is how this was caught.

CREATE TABLE IF NOT EXISTS public.manatal_publish_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  requisition_id  uuid REFERENCES public.requisitions(id) ON DELETE CASCADE,
  actor_id        uuid,
  -- 'precondition' | 'create' | 'update' | 'publish'
  step            text NOT NULL,
  ok              boolean NOT NULL,
  manatal_job_id  text,
  http_status     integer,
  message         text,
  -- What we actually sent, so a wrong field is visible after the fact
  -- rather than reconstructed from whichever code was deployed that day.
  sent            jsonb
);

CREATE INDEX IF NOT EXISTS idx_manatal_publish_log_req
  ON public.manatal_publish_log (requisition_id, created_at DESC);

ALTER TABLE public.manatal_publish_log ENABLE ROW LEVEL SECURITY;

-- Staff-only read. The service role bypasses RLS and is what the route
-- writes with.
DROP POLICY IF EXISTS manatal_publish_log_staff_read ON public.manatal_publish_log;
CREATE POLICY manatal_publish_log_staff_read
  ON public.manatal_publish_log FOR SELECT
  USING (public.is_tps_staff());

COMMENT ON TABLE public.manatal_publish_log IS
  'One row per Manatal publish step. Exists because a failure that is only rendered in the browser cannot be diagnosed afterwards.';
