-- ═══════════════════════════════════════════════════════════════════
-- 205: controls.safety_critical — Critical Control Visibility
-- (go-live gap list, item 4, 2026-10-02)
-- ═══════════════════════════════════════════════════════════════════
--
-- controls (123) has no concept of "this specific control is
-- safety-critical" — the same fact training_courses/competencies/
-- authorisation_types/job_roles already carry on their own catalogues
-- (Phase 3). Added here on the catalogue, not on risk_item_controls
-- (the per-use row) — a control's own nature (e.g. "gas detection",
-- "emergency stop") does not change depending on which risk assessment
-- happens to use it, the same reasoning a course's safety-critical
-- flag does not vary per person who takes it.
--
-- Nullable-free, defaulted false: an existing control is NOT
-- retroactively marked critical by this migration — that is a
-- judgement call for whoever manages the catalogue, made explicitly
-- per control, never guessed from its title or type.

ALTER TABLE public.controls ADD COLUMN IF NOT EXISTS safety_critical boolean NOT NULL DEFAULT false;
