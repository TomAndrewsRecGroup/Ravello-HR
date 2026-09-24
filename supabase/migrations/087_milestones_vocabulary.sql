-- 087: one vocabulary for `milestones` (2026-09-24).
--
-- Three screens spoke three dialects of this table: the admin client tab
-- wrote pillar 'HIRE' / quarter 'Q2 2026' / status 'Not Started', the
-- portal People Roadmap read 'hire' / 'Q2-2026' / 'not_started', and the
-- admin cross-client Roadmap read a `track` column that never existed.
-- The code now shares lib/roadmap/milestones.ts; these CHECKs make the
-- database refuse any other spelling, so the dialects cannot drift back.
--
-- The table held 0 rows when this was written, so no data is rewritten.

ALTER TABLE public.milestones
  ADD CONSTRAINT milestones_pillar_check
    CHECK (pillar IN ('hire', 'lead', 'protect')),
  ADD CONSTRAINT milestones_status_check
    CHECK (status IN ('not_started', 'in_progress', 'complete', 'at_risk')),
  ADD CONSTRAINT milestones_quarter_check
    CHECK (quarter ~ '^Q[1-4]-[0-9]{4}$');
