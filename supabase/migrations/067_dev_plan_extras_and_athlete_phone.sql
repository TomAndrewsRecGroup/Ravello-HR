-- ═══════════════════════════════════════════════════════════
-- Phase 67: Dev plan extras + athlete phone
--
-- 1. dev_plans.training_items + dev_plans.roles_items (JSONB)
--    Each is a list of free-text pairs:
--      [{ box1: '…', box2: '…' }, …]
--    Box 1 = a heading-ish label, Box 2 = a free description / link.
-- 2. athletes.phone TEXT — phone number on the athlete profile.
-- ═══════════════════════════════════════════════════════════

ALTER TABLE dev_plans
  ADD COLUMN IF NOT EXISTS training_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS roles_items    JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS phone TEXT;
