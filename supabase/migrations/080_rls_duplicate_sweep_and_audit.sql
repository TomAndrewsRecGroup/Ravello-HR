-- ═══════════════════════════════════════════════════════════
-- Phase 80: Finish the duplicate sweep, and make RLS drift
--           self-reporting so it cannot silently return
--
-- 079 dropped 90 policies matched by a "short name" heuristic. Six
-- duplicates escaped it because their legacy names were 9 characters
-- rather than 8. Rather than widen the heuristic and re-run it, this
-- migration names them explicitly and then installs an audit function,
-- so the NEXT instance of this is found by the platform rather than by
-- somebody reading pg_policies by hand.
--
-- ⚠ THE DIRECTION OF THESE DROPS IS LOAD-BEARING.
--
-- The four onboarding/offboarding pairs look equivalent and are not.
-- One side calls is_tps_staff(); the other inlines
-- role IN ('tps_admin','tps_client'). Those differ, because the live
-- is_tps_staff() is:
--
--     SELECT EXISTS(SELECT 1 FROM profiles
--                    WHERE id = auth.uid() AND role = 'tps_admin')
--
-- — tps_admin ONLY. (CLAUDE.md claims Phase 30 corrected this function
-- to include tps_client. It did not, or it was reverted. That
-- discrepancy is deliberately NOT resolved here: widening
-- is_tps_staff() would broaden access across ~50 policies in one
-- statement, which is an operator decision, not a cleanup.)
--
-- So in each pair the is_tps_staff() side is the NARROWER one, and it
-- is the one dropped. Dropping the other would silently revoke
-- tps_client access to onboarding and offboarding templates.
--
-- Idempotent. Safe to re-run.
-- ═══════════════════════════════════════════════════════════

-- ─── 1. Genuinely identical: both sides are is_tps_staff() ──
DROP POLICY IF EXISTS bd_co_all ON public.bd_companies;
DROP POLICY IF EXISTS bd_ro_all ON public.bd_scanned_roles;

-- ─── 2. Narrower-of-two: keep the side that admits tps_client ──
DROP POLICY IF EXISTS of_tt_all ON public.offboarding_template_tasks;
DROP POLICY IF EXISTS of_tt_sel ON public.offboarding_template_tasks;
DROP POLICY IF EXISTS ob_tt_all ON public.onboarding_template_tasks;
DROP POLICY IF EXISTS ob_tt_sel ON public.onboarding_template_tasks;

-- ─── 3. Redundant: the surviving policy is strictly broader ──
-- read_published_content: TO public, (is_published AND auth.uid() IS NOT NULL)
-- auth_learning_content_read: TO authenticated, (is_published OR is_tps_staff())
-- Every reader the first admits, the second admits.
DROP POLICY IF EXISTS read_published_content ON public.learning_content;

-- ─── 4. The audit function ─────────────────────────────────
--
-- Returns one row per RLS problem. Surfaced on the admin Health page,
-- so the next duplicate policy is reported by the platform on the day
-- it appears rather than found in an audit months later.
--
-- Deliberately reports rather than enforces: a legitimate staff/client
-- policy pair is normal and common here, so this cannot be a
-- constraint. It classifies instead.

CREATE OR REPLACE FUNCTION public.rls_policy_audit()
RETURNS TABLE (
  severity    text,
  table_name  text,
  detail      text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  -- A table with RLS off, or on with no policies at all.
  SELECT 'critical'::text,
         c.relname::text,
         CASE WHEN NOT c.relrowsecurity
              THEN 'RLS is DISABLED — the anon key can read and write this table'
              ELSE 'RLS enabled but NO policies — the table is unreachable' END
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_policy p ON p.polrelid = c.oid
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  GROUP BY c.relname, c.relrowsecurity
  HAVING NOT c.relrowsecurity OR count(p.polname) = 0

  UNION ALL

  -- A permissive policy that permits everything. Permissive policies
  -- are OR'd, so one of these makes every stricter policy beside it
  -- decoration. This is what let any logged-in user write to
  -- activity_log and notifications for another company.
  SELECT 'critical'::text,
         pol.tablename::text,
         format('policy %L permits ALL rows (%s) — it overrides every stricter policy on this table',
                pol.policyname,
                CASE WHEN pol.qual = 'true' THEN 'USING true' ELSE 'WITH CHECK true' END)
  FROM pg_policies pol
  WHERE pol.schemaname = 'public'
    AND pol.permissive = 'PERMISSIVE'
    AND (pol.qual = 'true' OR pol.with_check = 'true')
    -- salary_benchmarks is shared market reference data, readable by
    -- every client by design. Named explicitly so the exemption is a
    -- decision on the record rather than a hole nobody noticed.
    AND NOT (pol.tablename = 'salary_benchmarks' AND pol.cmd = 'SELECT')

  UNION ALL

  -- A permissive policy whose expression names no scoping at all.
  SELECT 'warning'::text,
         pol.tablename::text,
         format('policy %L has no company, user or staff scoping in its expression', pol.policyname)
  FROM pg_policies pol
  WHERE pol.schemaname = 'public'
    AND pol.permissive = 'PERMISSIVE'
    AND coalesce(pol.qual, pol.with_check, '') <> ''
    AND coalesce(pol.qual, pol.with_check) !~* '(company_id|is_tps_staff|get_my_role|my_company_id|auth\.uid|user_id)'
    AND NOT (pol.tablename = 'salary_benchmarks' AND pol.cmd = 'SELECT')

  UNION ALL

  -- Three or more permissive policies on one command is the shape that
  -- produced 99 legacy duplicates: a rewrite that never dropped what it
  -- replaced. Two is the normal staff/client split and is not reported.
  SELECT 'warning'::text,
         d.tablename::text,
         format('%s permissive %s policies on one table (%s) — a rewrite may not have dropped what it replaced',
                d.n, d.cmd, d.names)
  FROM (
    SELECT tablename, cmd, count(*) AS n,
           string_agg(policyname, ', ' ORDER BY policyname) AS names
    FROM pg_policies
    WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
    GROUP BY tablename, cmd
    HAVING count(*) > 2
  ) d

  ORDER BY 1, 2;
$$;

REVOKE ALL ON FUNCTION public.rls_policy_audit() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rls_policy_audit() TO authenticated;

COMMENT ON FUNCTION public.rls_policy_audit() IS
  'RLS drift report, surfaced on the admin Health page. Reports rather than enforces: a staff/client policy pair is legitimate here, so this classifies instead of constraining.';
