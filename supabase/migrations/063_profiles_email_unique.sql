-- ═══════════════════════════════════════════════════════════
-- Phase 63: Unique index on profiles.email
--
-- Closes a concurrent-invite race in /api/invite and
-- /api/portal/invite. Both routes do a read-then-write on
-- profiles.email — two parallel invites for the same address
-- both saw existingProfile=null, both called auth.admin.createUser
-- (one wins, the other becomes a stray auth user with no profile),
-- and both upsert'd a profile row, with the second clobbering the
-- first's invite_token.
--
-- Defensive: lowercase + trim emails on insert. The application
-- code already does this; the unique index ignores case so we
-- can't accidentally land 'foo@x.com' alongside 'FOO@x.com'.
--
-- Idempotent. Safe to re-run. If duplicate emails exist on a
-- partial deploy the migration logs them and exits with an error
-- so the operator can de-duplicate before retrying.
-- ═══════════════════════════════════════════════════════════

-- Pre-flight: detect duplicates so the operator gets a clean error
-- before we attempt the unique-index build.
DO $$
DECLARE
  dup_count INT;
BEGIN
  SELECT COUNT(*) INTO dup_count
    FROM (
      SELECT lower(email) AS e, COUNT(*) AS n
        FROM profiles
       WHERE email IS NOT NULL
       GROUP BY lower(email)
      HAVING COUNT(*) > 1
    ) d;
  IF dup_count > 0 THEN
    RAISE EXCEPTION 'profiles has % duplicated email value(s) (case-insensitive). Resolve before applying this migration.', dup_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_email_lower_unique
  ON profiles ((lower(email)))
  WHERE email IS NOT NULL;
