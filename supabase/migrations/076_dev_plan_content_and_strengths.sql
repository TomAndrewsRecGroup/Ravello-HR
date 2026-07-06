-- ═══════════════════════════════════════════════════════════
-- Phase 76: Dev plan rich content + strengths profile
--
-- Upgrades Development Plans into full "Athlete Transition
-- Report" documents. Adds two JSONB columns to dev_plans:
--
--   content   structured, ordered report sections (executive
--             summary, positioning callout, profile, career
--             overview, discovery findings, personality traits,
--             career paths, target companies, opportunity,
--             overall assessment). Rich-text fields hold
--             sanitised HTML authored via Tiptap.
--
--   strengths [{ label, rating }] — 0..5 ratings that drive the
--             strengths radar chart.
--
-- Both default to empty so every existing plan keeps working —
-- the renderer falls back to the legacy summary/milestones when
-- content is empty.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE dev_plans
  ADD COLUMN IF NOT EXISTS content   JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS strengths JSONB NOT NULL DEFAULT '[]'::jsonb;
