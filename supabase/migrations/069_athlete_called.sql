-- ═══════════════════════════════════════════════════════════
-- Phase 69: Athlete "Called" flag
--
-- Admin staff can mark an athlete as called. The flag surfaces
-- in both the admin and the client portal as a soft green-glow
-- border around their card so clients can see at a glance who
-- their account manager has reached out to.
--
-- called_at NULL  → not called yet
-- called_at TS    → most recent time the call was logged
-- called_by       → which TPS staff member ticked it
-- ═══════════════════════════════════════════════════════════

ALTER TABLE athletes
  ADD COLUMN IF NOT EXISTS called_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS called_by UUID REFERENCES profiles(id) ON DELETE SET NULL;
