-- Athletes To Industry Thursday roles email: spread the send over an hour.
--
-- Operator, 2026-10-29, after the first real send went to 17 athletes in
-- one burst at 15:00: "going forward can we stagger the sends over 60
-- minutes". A mailbox sending a batch at once reads as bulk mail, to
-- Microsoft 365 and to the recipients' filters.
--
-- Each delivery gets the time it is due when it is queued. The cron
-- (every 5 minutes, admin/vercel.json) sends only what is due, so the
-- emails go out one or two at a time from 15:00 to 16:00 UK time.
-- lib/a2iRoles/schedule.ts staggerSlots() decides the times; send.ts
-- uses them.
--
-- NULL means "send as soon as possible": deliveries queued before this
-- migration, and every delivery a staff member queues with "Send now",
-- which sends everything outstanding straight away. ADD COLUMN only; no
-- data is changed.

ALTER TABLE public.a2i_role_alert_deliveries
  ADD COLUMN IF NOT EXISTS scheduled_at timestamptz;

CREATE INDEX IF NOT EXISTS a2i_role_alert_deliveries_due_idx
  ON public.a2i_role_alert_deliveries (send_id, status, scheduled_at);
