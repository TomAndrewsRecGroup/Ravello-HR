-- ════════════════════════════════════════════════════════════════════════
-- Migration 045: Add 'client_editor' to user_role enum
-- ────────────────────────────────────────────────────────────────────────
-- This is part 1 of 2. Postgres safety rule:
--
--   "New enum values must be committed before they can be used."
--
-- Adding a value to an enum and using it in an UPDATE in the SAME
-- transaction fails with `unsafe use of new value`. Supabase's SQL
-- Editor wraps everything in one transaction by default, so we split
-- the role migration into two files:
--
--   045 (this file)  → just ALTER TYPE ADD VALUE
--   046              → migrate existing rows + helper function +
--                       DELETE policy gates that reference the new role
--
-- Run them sequentially. Both are idempotent.
-- ════════════════════════════════════════════════════════════════════════

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'client_editor';

-- Verification — should be true after this commits.
SELECT EXISTS(
  SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
   WHERE t.typname = 'user_role' AND e.enumlabel = 'client_editor'
) AS editor_role_exists;
