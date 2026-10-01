-- rls_policy_audit() (080, Foundations Sweep) predates the capability/
-- workforce scoping vocabulary Phases 1-3 introduced (person_visible(),
-- is_me(), the service-role-only zero-policy pattern, the reviewed
-- global capability catalogue). Live on 2026-10-01: the admin /health
-- page's "Row-level security" panel — the ONE page built to surface
-- real RLS drift on every load — was reporting 6 critical + 25 warning
-- findings. Investigated each one against the LIVE policy text before
-- touching this function, per this codebase's own standing rule
-- ("never assume PostgREST/RLS behaviour, verify live"):
--
-- - 25/25 warnings were false positives. Every one of them is a
--   `_read` policy scoped by a bare `person_visible(person_id)` or
--   `is_me(person_id)` call (person_authorisations, person_competencies,
--   person_credentials, person_deployment_status, role_assignments,
--   training_records, training_attendance, pre_employment_checks,
--   ppe_issues, induction_assignments/completions, development_items,
--   requirement_exceptions, authorisation_suspensions,
--   competency_suspensions, deployment_status_log) — real, Phase 3
--   scoping, just invisible to a regex written before either function
--   existed. Fixed by adding both names to the recognised-scoping list.
-- - 2/6 criticals were false positives: entity_qr_tokens (196) and
--   worker_qr_tokens (179) are RLS-on with deliberately ZERO session
--   policies — service role only, documented in CLAUDE.md as "fails
--   closed" by design, the exact policy_ack_tokens/hs_test_tokens
--   shape (those three instead carry 3 RESTRICTIVE write-guard
--   policies with no SELECT grant, which is why they never tripped
--   this check at all). Exempted by name, mirroring the salary_
--   benchmarks exemption already in this function.
-- - 4/6 criticals were real USING(true) policies, legitimately so:
--   access_capabilities/access_role_capabilities/access_roles (117)
--   and legacy_role_map (117) are the platform-wide capability/role
--   catalogue — non-tenant reference data (what capabilities exist,
--   what a role maps to) every authenticated session must resolve,
--   the same category as salary_benchmarks' own SELECT exemption.
--   Each policy is already restricted `TO authenticated` (verified
--   live via pg_policies.roles), so the separate `anon` table grant
--   these four tables also carried was inert under RLS — tightened
--   below anyway, matching 093's own "revoke what nothing needs,
--   even when already inert" discipline, rather than left as a latent
--   permission a future RLS change could turn live. Exempted by exact
--   policy name, NOT by relaxing the USING(true) detection itself —
--   a future accidental blanket policy on a genuinely tenant-scoped
--   table must still be caught.
--
-- Net effect, verified live before and after: 6 critical + 25 warning
-- -> 0 + 0. No RLS policy, grant visible to `authenticated`, or actual
-- tenant-isolation behaviour changed for any live session — only the
-- audit's own detection and the dead `anon` grant.

CREATE OR REPLACE FUNCTION public.rls_policy_audit()
 RETURNS TABLE(severity text, table_name text, detail text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT 'critical'::text, c.relname::text,
         CASE WHEN NOT c.relrowsecurity
              THEN 'RLS is DISABLED — the anon key can read and write this table'
              ELSE 'RLS enabled but NO policies — the table is unreachable' END
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN pg_policy p ON p.polrelid = c.oid
  WHERE n.nspname = 'public' AND c.relkind = 'r'
  GROUP BY c.relname, c.relrowsecurity
  HAVING (NOT c.relrowsecurity OR count(p.polname) = 0)
    AND c.relname NOT IN ('entity_qr_tokens', 'worker_qr_tokens')
  UNION ALL
  SELECT 'critical'::text, pol.tablename::text,
         format('policy %L permits ALL rows (%s) — it overrides every stricter policy on this table',
                pol.policyname,
                CASE WHEN pol.qual = 'true' THEN 'USING true' ELSE 'WITH CHECK true' END)
  FROM pg_policies pol
  WHERE pol.schemaname = 'public' AND pol.permissive = 'PERMISSIVE'
    AND (pol.qual = 'true' OR pol.with_check = 'true')
    AND NOT (pol.tablename = 'salary_benchmarks' AND pol.cmd = 'SELECT')
    AND pol.policyname NOT IN (
      'access_capabilities_read', 'access_role_capabilities_read',
      'access_roles_read', 'legacy_role_map_read'
    )
  UNION ALL
  SELECT 'warning'::text, pol.tablename::text,
         format('policy %L has no company, user or staff scoping in its expression', pol.policyname)
  FROM pg_policies pol
  WHERE pol.schemaname = 'public' AND pol.permissive = 'PERMISSIVE'
    AND coalesce(pol.qual, pol.with_check, '') <> ''
    AND coalesce(pol.qual, pol.with_check) !~* '(company_id|is_tps_staff|get_my_role|my_company_id|auth\.uid|user_id|person_visible|is_me\()'
    AND NOT (pol.tablename = 'salary_benchmarks' AND pol.cmd = 'SELECT')
    -- same reviewed catalogue exemption as the USING(true) branch above:
    -- these four ARE the "no company/user/staff scoping" case, by
    -- design — platform-wide reference data, not tenant data.
    AND pol.policyname NOT IN (
      'access_capabilities_read', 'access_role_capabilities_read',
      'access_roles_read', 'legacy_role_map_read'
    )
  UNION ALL
  SELECT 'warning'::text, d.tablename::text,
         format('%s permissive %s policies on one table (%s) — a rewrite may not have dropped what it replaced',
                d.n, d.cmd, d.names)
  FROM (
    SELECT tablename, cmd, count(*) AS n,
           string_agg(policyname, ', ' ORDER BY policyname) AS names
    FROM pg_policies
    WHERE schemaname = 'public' AND permissive = 'PERMISSIVE'
    GROUP BY tablename, cmd HAVING count(*) > 2
  ) d
  ORDER BY 1, 2;
$function$;

REVOKE SELECT, REFERENCES, TRIGGER ON
  public.access_capabilities,
  public.access_role_capabilities,
  public.access_roles,
  public.legacy_role_map
FROM PUBLIC, anon;
