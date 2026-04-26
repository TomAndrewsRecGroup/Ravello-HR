-- ════════════════════════════════════════════════════════════════════════
-- Factory reset: nuke all test data BUT preserve TPS staff users
-- ────────────────────────────────────────────────────────────────────────
-- Use case: you've spent a session creating test clients, employees,
-- roles, candidates, athletes, partners, etc. to QA the apps. Now you
-- want to wipe everything and go live with real client data.
--
-- This script:
--   • KEEPS  every profile with role IN ('tps_admin', 'tps_client')
--   • KEEPS  the company those staff profiles belong to (so you stay
--            logged in and your account isn't orphaned)
--   • DELETES every other company — cascades to their requisitions,
--            candidates, documents, tickets, employees, athletes, etc.
--   • DELETES every non-staff profile + matching auth.users row
--   • DELETES platform-wide test content: partners, salary_benchmarks,
--            jd_templates, latest_updates, feed_sources, bd_companies,
--            bd_scanned_roles, internal_tasks, client_notes
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

DO $$
DECLARE
  staff_user_ids   UUID[];
  staff_company_id UUID;
  before_companies BIGINT;
  before_profiles  BIGINT;
  before_authusers BIGINT;
  after_companies  BIGINT;
  after_profiles   BIGINT;
  after_authusers  BIGINT;
BEGIN
  -- ── 1. Capture what to preserve ──────────────────────────────────
  SELECT array_agg(id) INTO staff_user_ids
    FROM profiles
   WHERE role IN ('tps_admin', 'tps_client');

  IF staff_user_ids IS NULL OR array_length(staff_user_ids, 1) = 0 THEN
    RAISE EXCEPTION 'No tps_admin or tps_client profiles found — refusing to reset because you would be locked out. Create a staff profile first.';
  END IF;

  -- Pick the first staff user's company. If multiple staff belong to
  -- different companies (unusual), they all stay because we delete
  -- by NOT IN — see below.
  SELECT company_id INTO staff_company_id
    FROM profiles
   WHERE id = staff_user_ids[1];

  RAISE NOTICE 'Preserving % staff user(s) and their company id %',
    array_length(staff_user_ids, 1), staff_company_id;

  -- ── 2. Snapshot row counts (for the report) ──────────────────────
  SELECT COUNT(*) INTO before_companies FROM companies;
  SELECT COUNT(*) INTO before_profiles  FROM profiles;
  SELECT COUNT(*) INTO before_authusers FROM auth.users;

  -- ── 3. Delete non-staff companies ────────────────────────────────
  -- All staff company_ids are exempt. Deleting a company cascades to
  -- requisitions, candidates, documents, tickets, ticket_messages,
  -- service_requests, actions, milestones, client_services,
  -- compliance_items, athletes (and their interests via athlete_id),
  -- training_needs, performance_reviews, skills_matrix,
  -- absence_records, employee_documents, hr_metrics,
  -- employee_records, onboarding_*, offboarding_*, policy_acks,
  -- learning_purchases, ivylens_tickets, activity_log, client_notes,
  -- internal_tasks (where company_id is set), and offers/interview
  -- schedules via their requisitions.
  DELETE FROM companies
   WHERE id NOT IN (
     SELECT company_id FROM profiles
      WHERE id = ANY(staff_user_ids) AND company_id IS NOT NULL
   );

  -- ── 4. Delete non-staff profiles ─────────────────────────────────
  DELETE FROM profiles WHERE id <> ALL(staff_user_ids);

  -- ── 5. Delete the corresponding auth.users rows ──────────────────
  -- This also clears refresh_tokens / sessions for those users.
  DELETE FROM auth.users WHERE id <> ALL(staff_user_ids);

  -- ── 6. Wipe platform-wide test content ───────────────────────────
  -- These are not company-scoped, so the cascade in step 3 didn't
  -- touch them. TRUNCATE is faster than DELETE and resets sequences
  -- where applicable. CASCADE handles any downstream FK constraints
  -- (e.g. bd_scanned_roles → bd_companies, athlete_partner_interests
  -- → partners — though athletes are already gone via step 3).
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

  -- ── 7. Optional: clear catch-all tables that may have rows tied
  --      to test users we just deleted. Most of these cascade via
  --      auth.users delete, but be explicit so the script is loud
  --      about its intent.
  DELETE FROM notifications        WHERE user_id <> ALL(staff_user_ids);
  -- sync_state is a tiny key/value table for cron poll cursors —
  -- safe to leave; it'll repopulate on next ingest.

  -- ── 8. Report ────────────────────────────────────────────────────
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
