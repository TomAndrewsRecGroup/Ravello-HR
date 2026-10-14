-- rls_policy_audit() (080, re-tuned 198) went stale again — found live
-- 2026-10-14 during a production audit, the same way 198's own gap was
-- found: by actually calling the function, not by trusting its own
-- exemption list was kept current.
--
-- Two false positives, both from migration 213 (document template
-- library + e-signing), which shipped AFTER 198's fix and was never
-- added to either list:
--
-- 1. `document_signature_tokens` — RLS-on-with-zero-policies, the exact
--    `policy_ack_tokens`/`entity_qr_tokens`/`worker_qr_tokens`/
--    `report_share_tokens` "service role only, fails closed by design"
--    shape 213's own migration comment already documents. 198 added
--    the first three of that family to this function's exemption list;
--    `document_signature_tokens` and `report_share_tokens` (207) were
--    each added later and only `report_share_tokens` made it in.
--
-- 2. `document_templates_client_read` — genuinely scoped
--    (`status = 'active' AND is_company_super_user()`, confirmed live
--    via pg_policy), but the warning branch's scoping regex never
--    learned `is_company_super_user` the way 198 taught it
--    `person_visible`/`is_me`. Same root cause as 198 itself: a new
--    predicate function existed in the codebase and nothing updated
--    the audit's own pattern list for it.
--
-- Net effect, verified live before and after: 2 critical + 1 warning
-- finding on the only two real tables these resolve against →
-- 0. Nothing about the live security posture changed — only the
-- audit's own recognition of two already-deliberate shapes.

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
    AND c.relname NOT IN ('entity_qr_tokens', 'worker_qr_tokens', 'report_share_tokens', 'document_signature_tokens')
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
    AND coalesce(pol.qual, pol.with_check) !~* '(company_id|is_tps_staff|get_my_role|my_company_id|auth\.uid|user_id|person_visible|is_me\(|is_company_super_user)'
    AND NOT (pol.tablename = 'salary_benchmarks' AND pol.cmd = 'SELECT')
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
