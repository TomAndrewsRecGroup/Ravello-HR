-- 203: drop the dead `tickets`/`ticket_messages` tables.
--
-- "Support & BD in sync" (2026-09-25) already retired these as the
-- support object in favour of `service_requests` — CLAUDE.md records
-- both as "0 rows, confirmed live" at that time and the admin/portal
-- ticket UI pages were removed. What was NOT true, discovered during
-- a follow-up gap-closure pass (2026-10-02): the table was never
-- actually dead code. ~10 read sites across both apps (/health,
-- /engagement, /activity, /reports, /value-reports, the client-detail
-- billing cache, clients/summary, two crons, and the portal HIRE
-- metrics page) were still querying `tickets` for an "open support
-- load" signal feeding health bands, engagement scores and the
-- client-facing Value Report — all silently reading zero rows forever,
-- since nothing has written to `tickets` since the 2026-09-25 cutover.
--
-- Every one of those ~10 sites has now been redirected to
-- `service_requests` (the actual live support object) in this same
-- change. `ticket_messages` had genuinely zero references anywhere —
-- it never had a writer either, and no reader was ever built for it.
--
-- Verified live immediately before writing this migration: both
-- tables hold 0 rows. Dropping `ticket_messages` first (it FKs to
-- `tickets`), then `tickets` itself.

DROP TABLE IF EXISTS public.ticket_messages;
DROP TABLE IF EXISTS public.tickets;
