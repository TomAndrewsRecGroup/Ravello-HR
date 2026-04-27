-- ════════════════════════════════════════════════════════════════════════
-- Factory reset: nuke all test data BUT preserve TPS staff users
-- ────────────────────────────────────────────────────────────────────────
-- Use case: you've spent a session creating test clients, employees,
-- roles, candidates, athletes, partners, etc. to QA the apps. Now you
-- want to wipe everything and go live with real client data.
--
-- This script:
--   • DROPS   the legacy demo-link trigger (trg_link_tps_staff) and
--             function (link_tps_staff_to_demo) if they still exist —
--             they were retired in migration 049 but a stale env may
--             still have them, and they break profile UPDATEs after
--             the demo company is deleted.
--   • KEEPS   every profile with role = 'tps_admin'
--   • DELETES every other profile + matching auth.users row
--   • DELETES every company (cascades to all client-scoped tables)
--   • CLEARS  staff company_id refs to the deleted demo company so
--             nothing is left pointing at a dead UUID
--   • DELETES platform-wide test content: partners, salary_benchmarks,
--             jd_templates, latest_updates, feed_sources, bd_companies,
--             bd_scanned_roles, internal_tasks, client_notes
--   • LEAVES  the schema, RLS policies, indexes, helpers untouched
--
-- DOES NOT touch:
--   • Supabase Storage objects (CV files, document uploads, athlete
--     avatars). Storage is bucket-scoped — clean those manually via
--     the dashboard or with a separate storage admin script.
--   • Any cache layer (Vercel edge cache, Redis, etc.). The next
--     request will repopulate from the now-empty DB.
--   • The auth schema itself.
--
-- HOW TO RUN
--   • Supabase dashboard → SQL Editor → paste this whole file → Run.
--   • Or psql -f supabase/scripts/factory_reset.sql against any env.
--
-- IDEMPOTENT — safe to run on an already-empty DB. Re-running just
-- repeats the verification report at the bottom.
--
-- WARNING — this is destructive. Run on production ONLY when you have
-- positively confirmed there is no real client data to preserve.
-- ════════════════════════════════════════════════════════════════════════


-- ────────────────────────────────────────────────────────────────────────
-- 0. Drop the legacy demo-link trigger + function if present
--    (migration 049 retires these, but if the script is run on a DB
--    where 049 hasn't been applied yet, the trigger would re-stamp
--    company_id back to the dead demo UUID on every staff profile
--    update and the reset would fail with an FK violation.)
-- ────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  trg RECORD;
BEGIN
  FOR trg IN
    SELECT t.tgname
      FROM pg_trigger t
      JOIN pg_proc p ON p.oid = t.tgfoid
     WHERE p.proname = 'link_tps_staff_to_demo'
       AND NOT t.tgisinternal
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON profiles', trg.tgname);
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS link_tps_staff_to_demo() CASCADE;


-- ────────────────────────────────────────────────────────────────────────
-- 1. Migrate any deprecated-role rows so the staff-id capture is clean
--    (skip client_viewer — never an enum value, code-only alias)
-- ────────────────────────────────────────────────────────────────────────

UPDATE profiles SET role = 'tps_admin'     WHERE role = 'tps_client';
UPDATE profiles SET role = 'client_editor' WHERE role = 'client_user';


DO $$
DECLARE
  staff_user_ids   UUID[];
  before_companies BIGINT;
  before_profiles  BIGINT;
  before_authusers BIGINT;
  after_companies  BIGINT;
  after_profiles   BIGINT;
  after_authusers  BIGINT;
BEGIN
  -- ── 2. Capture which users to preserve ──────────────────────────
  SELECT array_agg(id) INTO staff_user_ids
    FROM profiles
   WHERE role = 'tps_admin';

  IF staff_user_ids IS NULL OR array_length(staff_user_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No tps_admin profiles found — refusing to reset because you would be locked out. Create a staff profile first.';
  END IF;

  RAISE NOTICE 'Preserving % staff user(s)', array_length(staff_user_ids, 1);

  -- ── 3. Snapshot row counts (for the report) ─────────────────────
  SELECT COUNT(*) INTO before_companies FROM companies;
  SELECT COUNT(*) INTO before_profiles  FROM profiles;
  SELECT COUNT(*) INTO before_authusers FROM auth.users;

  -- ── 4. Null-out staff company_id refs first
  --      Staff don't need a company_id (they browse all clients via
  --      the picker). Clearing them up-front ensures step 5 can wipe
  --      every company without leaving a dangling FK.
  UPDATE profiles SET company_id = NULL WHERE id = ANY(staff_user_ids);

  -- ── 5. Delete EVERY company ─────────────────────────────────────
  -- Cascades to: requisitions, candidates, documents, tickets,
  -- ticket_messages, service_requests, actions, milestones,
  -- client_services, compliance_items, athletes (+ interests via
  -- athlete_id), training_needs, performance_reviews, skills_matrix,
  -- absence_records, employee_documents, hr_metrics, employee_records,
  -- onboarding_*, offboarding_*, policy_acks, learning_purchases,
  -- ivylens_tickets, activity_log, client_notes, internal_tasks
  -- (where company_id is set), offers / interview_schedules via
  -- their requisitions.
  DELETE FROM companies;

  -- ── 6. Delete non-staff profiles ────────────────────────────────
  DELETE FROM profiles WHERE id <> ALL(staff_user_ids);

  -- ── 7. Delete the corresponding auth.users rows ─────────────────
  -- Also clears refresh_tokens / sessions for those users.
  DELETE FROM auth.users WHERE id <> ALL(staff_user_ids);

  -- ── 8. Wipe platform-wide test content ──────────────────────────
  -- Not company-scoped, so step 5's cascade didn't touch them.
  TRUNCATE TABLE
    partners,
    bd_companies,
    bd_scanned_roles,
    salary_benchmarks,
    jd_templates,
    latest_updates,
    feed_sources,
    internal_tasks,
    client_notes
  CASCADE;

  -- ── 9. Belt-and-braces: clear stragglers tied to deleted users
  -- Most cascade via the auth.users delete in step 7, but being
  -- explicit makes the script's intent loud.
  DELETE FROM notifications WHERE user_id <> ALL(staff_user_ids);
  -- sync_state is a tiny key/value table for cron poll cursors —
  -- safe to leave; it'll repopulate on next ingest.

  -- ── 10. Reset onboarding flags on staff so a re-test feels fresh
  UPDATE profiles
     SET onboarding_completed = true,
         onboarding_step      = NULL
   WHERE id = ANY(staff_user_ids);

  -- ── 11. Report ──────────────────────────────────────────────────
  SELECT COUNT(*) INTO after_companies FROM companies;
  SELECT COUNT(*) INTO after_profiles  FROM profiles;
  SELECT COUNT(*) INTO after_authusers FROM auth.users;

  RAISE NOTICE '──────────────────────────────────────────';
  RAISE NOTICE 'Factory reset complete';
  RAISE NOTICE '──────────────────────────────────────────';
  RAISE NOTICE 'companies   : % → %', before_companies, after_companies;
  RAISE NOTICE 'profiles    : % → %', before_profiles,  after_profiles;
  RAISE NOTICE 'auth.users  : % → %', before_authusers, after_authusers;
  RAISE NOTICE 'Preserved staff users: %', array_length(staff_user_ids, 1);
  RAISE NOTICE '──────────────────────────────────────────';
  RAISE NOTICE 'NOTE: Supabase Storage objects (CV files, document';
  RAISE NOTICE '      uploads, athlete avatars) are NOT cleared by';
  RAISE NOTICE '      this script. Clean those via the dashboard if';
  RAISE NOTICE '      you want a truly clean slate.';
END $$;

-- Final sanity check — what's left?
SELECT 'profiles'   AS table_name, COUNT(*) AS row_count FROM profiles
UNION ALL SELECT 'companies',          COUNT(*) FROM companies
UNION ALL SELECT 'requisitions',       COUNT(*) FROM requisitions
UNION ALL SELECT 'candidates',         COUNT(*) FROM candidates
UNION ALL SELECT 'documents',          COUNT(*) FROM documents
UNION ALL SELECT 'tickets',            COUNT(*) FROM tickets
UNION ALL SELECT 'partners',           COUNT(*) FROM partners
UNION ALL SELECT 'athletes',           COUNT(*) FROM athletes
UNION ALL SELECT 'salary_benchmarks',  COUNT(*) FROM salary_benchmarks
UNION ALL SELECT 'jd_templates',       COUNT(*) FROM jd_templates
UNION ALL SELECT 'latest_updates',     COUNT(*) FROM latest_updates
UNION ALL SELECT 'feed_sources',       COUNT(*) FROM feed_sources
UNION ALL SELECT 'bd_companies',       COUNT(*) FROM bd_companies
UNION ALL SELECT 'auth.users',         COUNT(*) FROM auth.users
ORDER BY table_name;
