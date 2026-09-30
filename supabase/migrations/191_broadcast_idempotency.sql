-- ═══════════════════════════════════════════════════════════════════════
-- Core-OS 360 Completion Programme, Phase 25, Group 1 (C1.11): Broadcast
-- idempotency key.
--
-- POST /api/broadcast (admin/src/app/api/broadcast/route.ts) has never
-- had any idempotency guard: a double-click past the client-side
-- `disabled={sending}` button state, a browser retry after a timed-out
-- request, or a direct API replay would insert a SECOND `actions` row
-- per selected company and send a SECOND email to every client_admin —
-- exactly the class of defect this repo's own history already recorded
-- twice (the 21-people/518-email referral-cron duplicate, and the
-- visit-report issue race, Phase 7 Group 8) and fixed the same way both
-- times: claim a caller-supplied idempotency key FIRST, under a real
-- UNIQUE constraint, before any work happens.
--
-- `broadcast_sends` is a pure claim/bookkeeping table — the same shape
-- `email_log` (074) already established for exactly this "TPS staff
-- only, no client exposure" posture: staff FOR ALL, no client policy,
-- no write guard (nothing here is client-writable to guard), no
-- audit_row trigger (the broadcast route's own `auditLog()` call already
-- records the real audit trail — company_ids, title, created count; this
-- table exists only to make a retry with the same key a safe no-op).
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.broadcast_sends (
  id               uuid PRIMARY KEY,
  created_by       uuid NOT NULL REFERENCES auth.users(id),
  title            text NOT NULL,
  recipient_count  integer NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.broadcast_sends ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN SELECT polname FROM pg_policy WHERE polrelid = 'public.broadcast_sends'::regclass LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.broadcast_sends', pol.polname);
  END LOOP;
END $$;

CREATE POLICY broadcast_sends_staff_all ON public.broadcast_sends FOR ALL TO authenticated
  USING ((SELECT public.is_tps_staff())) WITH CHECK ((SELECT public.is_tps_staff()));

REVOKE ALL ON public.broadcast_sends FROM anon;
