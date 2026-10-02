-- ═══════════════════════════════════════════════════════════════════
-- 206: broadcast_acknowledgements — Required Acknowledgement on
-- Broadcasts (go-live gap list, item 2, 2026-10-02)
-- ═══════════════════════════════════════════════════════════════════
--
-- POST /api/broadcast (admin) raises one actions row per company
-- (created_by_admin = true) and sends an email — nothing has ever
-- recorded whether the recipient actually read or acted on it, the
-- same gap policy_acknowledgements (103) and board_assurance_
-- acknowledgements (178) already closed for their own artefacts.
-- This is the identical shape: a client reads the broadcast-raised
-- action and explicitly acknowledges it, recorded for ever (insert-
-- only), not inferred from "mark complete" on the underlying action
-- (which many ordinary, non-broadcast actions already use for a
-- different purpose — completing a task is not the same fact as
-- having read a message).
--
-- company_id / acknowledged_by / acknowledged_by_name / acknowledged_at
-- are ALL derived from the parent action and the session by the fill
-- trigger below — never trusted from the caller, the same discipline
-- board_assurance_acknowledgements_fill() already uses. Only a
-- broadcast-raised action (created_by_admin = true) may be
-- acknowledged this way — an ordinary action already has its own
-- mark-complete/dismiss lifecycle and needs no second one.

CREATE TABLE IF NOT EXISTS public.broadcast_acknowledgements (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id             uuid NOT NULL REFERENCES public.actions(id) ON DELETE CASCADE,
  company_id            uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  acknowledged_by       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  acknowledged_by_name  text NOT NULL,
  comment               text CHECK (comment IS NULL OR length(comment) <= 1000),
  acknowledged_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (action_id, acknowledged_by)
);
CREATE INDEX IF NOT EXISTS broadcast_acknowledgements_action_idx
  ON public.broadcast_acknowledgements (action_id);

CREATE OR REPLACE FUNCTION public.broadcast_acknowledgements_fill()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_company uuid;
  v_created_by_admin boolean;
BEGIN
  SELECT company_id, created_by_admin INTO v_company, v_created_by_admin
    FROM public.actions WHERE id = NEW.action_id;
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'broadcast_acknowledgements: unknown action_id';
  END IF;
  IF v_created_by_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'broadcast_acknowledgements: this action was not raised by a broadcast';
  END IF;
  NEW.company_id := v_company;
  NEW.acknowledged_by := auth.uid();
  NEW.acknowledged_by_name := COALESCE(
    (SELECT full_name FROM public.profiles WHERE id = auth.uid()), 'A client user');
  NEW.acknowledged_at := now();
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.broadcast_acknowledgements_fill() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS broadcast_acknowledgements_fill ON public.broadcast_acknowledgements;
CREATE TRIGGER broadcast_acknowledgements_fill BEFORE INSERT ON public.broadcast_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.broadcast_acknowledgements_fill();

REVOKE UPDATE, DELETE, TRUNCATE ON public.broadcast_acknowledgements FROM PUBLIC, anon, authenticated;

SELECT public.apply_write_guard('public.broadcast_acknowledgements');

DROP TRIGGER IF EXISTS broadcast_acknowledgements_audit ON public.broadcast_acknowledgements;
CREATE TRIGGER broadcast_acknowledgements_audit AFTER INSERT ON public.broadcast_acknowledgements
  FOR EACH ROW EXECUTE FUNCTION public.audit_row('broadcast_acknowledgement', 'company_id', 'action_id', 'acknowledged_by');

-- No outbox entry — the original broadcast (actions.created) and its
-- own email already notified the client; an acknowledgement coming
-- BACK needs no automated consequence of its own, only a record staff
-- can read (the admin broadcast page below).

ALTER TABLE public.broadcast_acknowledgements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS broadcast_acknowledgements_staff_all ON public.broadcast_acknowledgements;
CREATE POLICY broadcast_acknowledgements_staff_all ON public.broadcast_acknowledgements FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

-- Plain company-scoped read/insert, no capability gate — actions
-- itself (002/044) predates the capability model and stays a plain
-- company read for any signed-in client user; this mirrors that, not
-- the H&S risk.read/risk.create capabilities, which do not apply to a
-- generic broadcast action.
DROP POLICY IF EXISTS broadcast_acknowledgements_client_read ON public.broadcast_acknowledgements;
CREATE POLICY broadcast_acknowledgements_client_read ON public.broadcast_acknowledgements FOR SELECT TO authenticated
  USING (company_id = (SELECT public.my_company_id()));

DROP POLICY IF EXISTS broadcast_acknowledgements_client_insert ON public.broadcast_acknowledgements;
CREATE POLICY broadcast_acknowledgements_client_insert ON public.broadcast_acknowledgements FOR INSERT TO authenticated
  WITH CHECK (company_id = (SELECT public.my_company_id()));
